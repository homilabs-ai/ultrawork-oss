import { LocalFilesystem, WORKSPACE_TOOLS, Workspace } from "@mastra/core/workspace";
import type { Repo } from "@/core/db/repo.ts";

export interface WorkspaceLogContext {
  repo: Repo;
  runId: string;
  agentId?: string;
  taskId?: string;
}

export function createMastraWorkspace(basePath: string, log?: WorkspaceLogContext): Workspace {
  return new Workspace({
    filesystem: new LocalFilesystem({ basePath }),
    tools: {
      [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: "readWorkspaceFile" },
      [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: "writeWorkspaceFile" },
      [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { name: "editWorkspaceFile" },
      [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: "listWorkspace" },
      [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { name: "deleteWorkspacePath" },
      [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { name: "statWorkspaceFile" },
      [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { name: "mkdirWorkspace" },
      [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: "grepWorkspace" },
      [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { enabled: false },
      ...(log
        ? {
            hooks: {
              afterToolCall: ({ workspaceToolName, input, error }) => {
                if (error) return;
                const path =
                  input &&
                  typeof input === "object" &&
                  "path" in input &&
                  typeof (input as { path: unknown }).path === "string"
                    ? (input as { path: string }).path
                    : undefined;
                if (!path) return;
                if (workspaceToolName === WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE) {
                  log.repo.logEvent({
                    runId: log.runId,
                    agentId: log.agentId ?? null,
                    taskId: log.taskId ?? null,
                    type: "workspace.write",
                    payload: { path },
                  });
                } else if (workspaceToolName === WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE) {
                  log.repo.logEvent({
                    runId: log.runId,
                    agentId: log.agentId ?? null,
                    taskId: log.taskId ?? null,
                    type: "workspace.edit",
                    payload: { path },
                  });
                }
              },
            },
          }
        : {}),
    },
  });
}
