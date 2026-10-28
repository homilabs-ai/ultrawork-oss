import { type QueryClient, skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  createRun,
  fetchModels,
  fetchVerifierDefaults,
  getRunState,
  getTaskDetail,
  listArtifacts,
  listRuns,
  openRunStream,
  steerRun,
  stopRun,
} from "@/api/runs";
import type { RunState } from "@/types/runs";

export const runKeys = {
  all: ["runs"] as const,
  list: () => [...runKeys.all, "list"] as const,
  state: (runId: string) => [...runKeys.all, "state", runId] as const,
  task: (runId: string, taskId: string) => [...runKeys.all, "task", runId, taskId] as const,
  artifacts: () => [...runKeys.all, "workspace-files"] as const,
};

export const runsQueryOptions = {
  queryKey: runKeys.list(),
  queryFn: listRuns,
  refetchInterval: 10_000,
};

export function useRuns() {
  return useQuery(runsQueryOptions);
}

export function useModels() {
  return useQuery({ queryKey: ["models"], queryFn: fetchModels, staleTime: 60_000 });
}

export function useVerifierDefaults() {
  return useQuery({ queryKey: ["verifier-defaults"], queryFn: fetchVerifierDefaults, staleTime: Infinity });
}

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRun,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: runKeys.list() });
      queryClient.invalidateQueries({ queryKey: runKeys.state(data.runId) });
      queryClient.invalidateQueries({ queryKey: runKeys.artifacts() });
    },
  });
}

export function useStopRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stopRun,
    onSettled: (_data, _error, runId) => {
      void queryClient.invalidateQueries({ queryKey: runKeys.list() });
      void queryClient.invalidateQueries({ queryKey: runKeys.state(runId) });
    },
  });
}

export function useSteerRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: steerRun,
    onMutate: async ({ runId, message, files }) => {
      const queryKey = runKeys.state(runId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RunState>(queryKey);
      const attachmentText = files.length > 0 ? `Attached: ${files.map((p) => p.split("/").pop()).join(", ")}` : "";
      const optimisticText = [message, attachmentText].filter(Boolean).join("\n\n");

      queryClient.setQueryData<RunState>(queryKey, (state) => {
        if (!state?.rootPlanner) return state;
        const timestamp = Date.now();
        return {
          ...state,
          rootPlanner: {
            ...state.rootPlanner,
            transcript: [
              ...state.rootPlanner.transcript,
              {
                id: `optimistic-steer:${timestamp}`,
                kind: "steer",
                timestamp,
                text: optimisticText,
              },
            ],
          },
        };
      });

      return { previous };
    },
    onError: (_error, { runId }, context) => {
      queryClient.setQueryData(runKeys.state(runId), context?.previous);
    },
    onSettled: (_data, _error, { runId }) => {
      void queryClient.invalidateQueries({ queryKey: runKeys.state(runId) });
      void queryClient.invalidateQueries({ queryKey: runKeys.artifacts() });
    },
  });
}

export function useRunState(runId: string | null) {
  return useQuery({
    queryKey: runKeys.state(runId ?? ""),
    queryFn: runId ? () => getRunState(runId) : skipToken,
  });
}

export function useTaskDetail(runId: string | null, taskId: string | null) {
  return useQuery({
    queryKey: runKeys.task(runId ?? "", taskId ?? ""),
    queryFn: runId && taskId ? () => getTaskDetail(runId, taskId) : skipToken,
  });
}

export function useArtifacts() {
  return useQuery({
    queryKey: runKeys.artifacts(),
    queryFn: listArtifacts,
    refetchInterval: 10_000,
  });
}

function invalidateRun(qc: QueryClient, runId: string) {
  void qc.invalidateQueries({ queryKey: runKeys.state(runId) });
  void qc.invalidateQueries({ queryKey: runKeys.list() });
  void qc.invalidateQueries({
    queryKey: [...runKeys.all, "task", runId],
  });
}

export function useRunStream(runId: string | null) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!runId) return;

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        invalidateRun(qc, runId);
      }, 250);
    };

    let greeted = false;
    const close = openRunStream(runId, (event) => {
      if ((event as { type?: string } | null)?.type === "hello" && !greeted) {
        greeted = true;
        return;
      }
      schedule();
    });

    return () => {
      close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId, qc]);
}
