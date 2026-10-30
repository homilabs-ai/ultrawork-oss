import { resolve } from "node:path";
import { Agent } from "@mastra/core/agent";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import type { HarnessConfig } from "@/core/config.ts";
import type { Repo } from "@/core/db/repo.ts";
import type { InboxRow, TaskRow } from "@/core/db/types.ts";
import { effectiveEffort, resolveVerifierModel, toMastraModel } from "@/core/models.ts";
import type { AgentDriver, Handoff } from "@/core/runtime/driver.ts";
import { TaskSteering } from "@/core/runtime/steering.ts";
import type { EventBus } from "@/core/transport/events.ts";
import type { Transport } from "@/core/transport/types.ts";
import { llmRetryProcessor } from "./llm-retry.ts";
import { mastraCallbacks } from "./mastra-stream-adapter.ts";
import { createMastraWorkspace } from "./mastra-workspace.ts";
import {
  buildPlannerBriefing,
  buildPlannerTurnMessage,
  buildVerifierBriefing,
  buildWorkerBriefing,
  plannerSystemInstructions,
  VERIFIER_SYSTEM,
  WORKER_SYSTEM,
} from "./prompts.ts";
import { thinkingProviderOptions } from "./thinking-options.ts";
import { openChromeSession } from "./tools/chrome-mcp.ts";
import { plannerTools, workerTools } from "./tools/index.ts";
import { steeringPrepareStep } from "./tools/steer-task.ts";
import { type TurnKind, TurnRecorder } from "./turn-recorder.ts";

const MAX_FALLBACK_SUMMARY_CHARS = 2_000;

export class MastraDriver implements AgentDriver {
  private llmCalls = 0;

  private readonly session: Memory;
  private readonly steering = new TaskSteering();

  private readonly workspaceRoot: string;

  constructor(
    private readonly repo: Repo,
    private readonly transport: Transport,
    workspaceRoot: string,
    private readonly config: HarnessConfig,
    private readonly bus: EventBus,
  ) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.session = new Memory({
      storage: new LibSQLStore({
        id: "planner-sessions",
        url: `file:${this.config.sessionDbPath}`,
      }),
      vector: false,
      options: {
        lastMessages: this.config.plannerSessionLastMessages,
        semanticRecall: false,
        workingMemory: { enabled: false },
      },
    });
  }

  getLlmCalls(): number {
    return this.llmCalls;
  }

  private async savedMessageCount(agentId: string, runId: string): Promise<number> {
    const thread = await this.session.getThreadById({ threadId: agentId, resourceId: runId });
    if (!thread) return 0;
    const { total } = await this.session.recall({ threadId: agentId, resourceId: runId, perPage: 1 });
    return total;
  }

  private async requeueIfNothingSaved(
    agentId: string,
    runId: string,
    savedBefore: number,
    inbox: InboxRow[],
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const stopped = abortSignal?.aborted || this.repo.getRun(runId)?.status === "idle";
    if (!stopped || inbox.length === 0) return;
    if ((await this.savedMessageCount(agentId, runId)) > savedBefore) return;
    this.repo.requeueInbox(inbox.map((item) => item.id));
    this.repo.logEvent({ runId, agentId, type: "planner.inbox.requeued", payload: { items: inbox.length } });
  }

  async runPlanner(agentId: string, abortSignal?: AbortSignal): Promise<void> {
    const planner = this.repo.getAgent(agentId);
    if (!planner) throw new Error(`planner not found: ${agentId}`);

    const run = this.repo.getRun(planner.run_id);
    if (!run) throw new Error(`run not found: ${planner.run_id}`);

    const inbox = this.transport.drainInbox(agentId);
    const ownTasks = this.repo.listTasks(planner.run_id).filter((task) => task.requester_agent_id === agentId);

    const savedBefore = await this.savedMessageCount(agentId, planner.run_id);
    const firstTurn = savedBefore === 0;
    const isRoot = planner.parent_agent_id === null;
    const message = firstTurn
      ? buildPlannerBriefing(planner, run.instruction_md, inbox, ownTasks)
      : buildPlannerTurnMessage(inbox, ownTasks);

    const { plannerMaxSteps } = this.config;
    const verifierPlugin = run.verifier_plugin ?? this.config.verifierPlugin;
    const plannerModel = toMastraModel(run.planner_model ?? this.config.plannerModel);
    const plannerThinkingLevel = effectiveEffort(plannerModel, run.thinking_level ?? this.config.plannerThinkingLevel);

    const recorder = this.startTurn("planner", planner.run_id, { agentId });

    const agent = new Agent({
      id: `planner-${planner.role}`,
      name: `planner-${planner.role}`,
      instructions: plannerSystemInstructions({
        verifierPlugin,
        isRoot,
      }),
      model: plannerModel,
      errorProcessors: [this.retryProcessor(recorder, { agentKind: "planner", agentId })],
      tools: plannerTools({
        repo: this.repo,
        transport: this.transport,
        config: this.config,
        agent: planner,
        workspaceRoot: this.workspaceRoot,
        verifierPlugin,
        steering: this.steering,
      }),
      workspace: createMastraWorkspace(this.workspaceRoot, {
        repo: this.repo,
        runId: planner.run_id,
        agentId,
      }),
      memory: this.session,
    });

    recorder.turnStarted({
      inbox: inbox.length,
      firstTurn,
      model: plannerModel,
      thinkingLevel: plannerThinkingLevel,
    });

    const startedAt = Date.now();
    const thinking = thinkingProviderOptions(plannerModel, plannerThinkingLevel);

    try {
      const result = await agent.generate(message, {
        maxSteps: plannerMaxSteps,
        abortSignal,
        stopWhen: () => {
          const currentPlanner = this.repo.getAgent(agentId);
          const status = this.repo.getRun(planner.run_id)?.status;
          return currentPlanner?.status === "done" || status === "idle";
        },
        ...(thinking ? { providerOptions: thinking } : {}),
        memory: { thread: agentId, resource: planner.run_id },
        savePerStep: true,
        ...mastraCallbacks(recorder),
      });

      recorder.turnEnded({
        toolCalls: result.toolCalls?.length ?? 0,
        elapsedMs: Date.now() - startedAt,
      });
      await this.requeueIfNothingSaved(agentId, planner.run_id, savedBefore, inbox, abortSignal);
    } catch (error) {
      if (abortSignal?.aborted) {
        await this.requeueIfNothingSaved(agentId, planner.run_id, savedBefore, inbox, abortSignal);
        this.repo.logEvent({
          runId: planner.run_id,
          agentId,
          type: "planner.turn.cancelled",
          payload: { elapsedMs: Date.now() - startedAt },
        });
        return;
      }
      recorder.turnFailed(error, {
        elapsedMs: Date.now() - startedAt,
        maxSteps: plannerMaxSteps,
        thinkingLevel: plannerThinkingLevel,
      });
      throw error;
    }
  }

  async runWorker(task: TaskRow, abortSignal?: AbortSignal): Promise<Handoff> {
    const run = this.repo.getRun(task.run_id);
    if (!run) throw new Error(`run not found: ${task.run_id}`);

    let handoff: Handoff | null = null;

    const { workerMaxSteps } = this.config;
    const isVerifier = task.type === "verifier";
    const workerModel = run.worker_model ?? this.config.workerModel;
    const model = toMastraModel(
      isVerifier ? resolveVerifierModel(this.config.verifierModel, workerModel) : workerModel,
    );
    const thinkingLevel = effectiveEffort(
      model,
      isVerifier
        ? this.config.verifierThinkingLevel
        : (run.worker_thinking_level ?? run.thinking_level ?? this.config.workerThinkingLevel),
    );

    const recorder = this.startTurn("worker", task.run_id, { taskId: task.id });

    const chrome = await openChromeSession({
      config: this.config,
      repo: this.repo,
      runId: task.run_id,
      taskId: task.id,
    });

    const agent = new Agent({
      id: isVerifier ? "verifier" : "worker",
      name: isVerifier ? "verifier" : "worker",
      instructions: isVerifier ? this.config.verifierPrompt.trim() || VERIFIER_SYSTEM : WORKER_SYSTEM,
      model,
      errorProcessors: [this.retryProcessor(recorder, { agentKind: "worker", taskId: task.id })],
      tools: workerTools({
        repo: this.repo,
        workspaceRoot: this.workspaceRoot,
        config: this.config,
        task,
        setHandoff: (submitted) => {
          handoff = submitted;
        },
      }),
      workspace: createMastraWorkspace(this.workspaceRoot, {
        repo: this.repo,
        runId: task.run_id,
        taskId: task.id,
      }),
    });

    recorder.turnStarted({
      model,
      thinkingLevel,
      taskType: task.type,
    });

    const startedAt = Date.now();
    const thinking = thinkingProviderOptions(model, thinkingLevel);

    try {
      const result = await agent.generate(
        isVerifier
          ? buildVerifierBriefing(run.instruction_md, task.scope_md || null)
          : buildWorkerBriefing(task.scope_md, run.instruction_md),
        {
          maxSteps: workerMaxSteps,
          abortSignal,
          stopWhen: () => {
            const status = this.repo.getRun(task.run_id)?.status;
            return status === "idle";
          },
          ...(thinking ? { providerOptions: thinking } : {}),
          ...(chrome ? { toolsets: chrome.toolsets } : {}),
          prepareStep: steeringPrepareStep(this.steering, task.id),
          ...mastraCallbacks(recorder),
        },
      );

      if (!handoff) {
        return {
          summary: result.text?.slice(0, MAX_FALLBACK_SUMMARY_CHARS) || "Worker stopped without submitting a handoff.",
          failed: true,
        };
      }

      recorder.turnEnded({ elapsedMs: Date.now() - startedAt });
      return handoff;
    } catch (error) {
      if (abortSignal?.aborted) {
        this.repo.logEvent({
          runId: task.run_id,
          taskId: task.id,
          type: "worker.turn.cancelled",
          payload: { elapsedMs: Date.now() - startedAt },
        });
        throw error;
      }
      recorder.turnFailed(error, {
        elapsedMs: Date.now() - startedAt,
        maxSteps: workerMaxSteps,
        thinkingLevel,
      });
      throw error;
    } finally {
      await chrome?.close().catch(() => {});
    }
  }

  private retryProcessor(recorder: TurnRecorder, context: Record<string, unknown>) {
    return llmRetryProcessor(this.config, (error, info) => {
      this.llmCalls++;
      recorder.turnRetrying(error, { ...context, ...info });
    });
  }

  private startTurn(kind: TurnKind, runId: string, attribution: { agentId?: string; taskId?: string }): TurnRecorder {
    this.llmCalls++;
    return new TurnRecorder({
      repo: this.repo,
      bus: this.bus,
      kind,
      runId,
      ...attribution,
    });
  }
}
