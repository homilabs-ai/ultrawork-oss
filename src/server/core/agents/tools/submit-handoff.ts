import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { WorkerToolContext } from "./context.ts";

export function submitHandoffTool({ setHandoff }: WorkerToolContext) {
  return createTool({
    id: "submitHandoff",
    description: "Finish the task. Verifiers must also provide a verdict and requiredActions for NEEDS_WORK.",
    inputSchema: z.object({
      summary: z.string(),
      concerns: z.string().optional(),
      findings: z.string().optional(),
      verdict: z.enum(["CLEAN", "NEEDS_WORK"]).optional(),
      requiredActions: z.string().optional(),
    }),
    execute: async (input: {
      summary: string;
      concerns?: string;
      findings?: string;
      verdict?: "CLEAN" | "NEEDS_WORK";
      requiredActions?: string;
    }) => {
      setHandoff({
        summary: input.summary,
        concerns: input.concerns,
        findings: input.findings,
        verdict: input.verdict,
        requiredActions: input.requiredActions,
      });
      return { ok: true };
    },
  });
}
