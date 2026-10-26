import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, File, FileCode, FileImage, FileText, FolderOpen, X } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { artifactContentUrl, getArtifactText } from "@/api/runs";
import { FileTree, FileTreeFile, FileTreeFolder } from "@/components/ai-elements/file-tree";
import { Button } from "@/components/ui/button";
import type { ArtifactFile } from "@/types/runs";

const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const AUTO_EXPAND_MAX_FILES = 50;

type FileTreeNode = {
  name: string;
  path: string;
  directories: Map<string, FileTreeNode>;
  files: ArtifactFile[];
  fileCount: number;
};

function finishTree(node: FileTreeNode): number {
  node.files.sort((a, b) => a.name.localeCompare(b.name));
  node.directories = new Map([...node.directories].sort(([a], [b]) => a.localeCompare(b)));
  node.fileCount = node.files.length;
  for (const child of node.directories.values()) node.fileCount += finishTree(child);
  return node.fileCount;
}

function buildTree(artifacts: ArtifactFile[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "Workspace",
    path: "",
    directories: new Map(),
    files: [],
    fileCount: 0,
  };
  for (const artifact of artifacts) {
    const parts = artifact.path.split("/");
    const filename = parts.pop();
    if (!filename) continue;
    let node = root;
    for (const part of parts) {
      let child = node.directories.get(part);
      if (!child) {
        child = {
          name: part,
          path: [node.path, part].filter(Boolean).join("/"),
          directories: new Map(),
          files: [],
          fileCount: 0,
        };
        node.directories.set(part, child);
      }
      node = child;
    }
    node.files.push(artifact);
  }
  finishTree(root);
  return root;
}

function iconFor(artifact: ArtifactFile) {
  if (artifact.mimeType.startsWith("image/")) return FileImage;
  if (
    artifact.mimeType.includes("json") ||
    artifact.mimeType.includes("javascript") ||
    artifact.mimeType.includes("typescript")
  ) {
    return FileCode;
  }
  if (artifact.mimeType.startsWith("text/")) return FileText;
  return File;
}

function canPreviewText(artifact: ArtifactFile): boolean {
  return (
    artifact.bytes <= MAX_TEXT_PREVIEW_BYTES &&
    (artifact.mimeType.startsWith("text/") ||
      artifact.mimeType.includes("json") ||
      artifact.mimeType.includes("xml") ||
      artifact.mimeType.includes("yaml") ||
      artifact.mimeType.includes("javascript") ||
      artifact.mimeType.includes("typescript"))
  );
}

function folderDefaults(node: FileTreeNode, out = new Map<string, boolean>()) {
  for (const child of node.directories.values()) {
    out.set(child.path, child.fileCount <= AUTO_EXPAND_MAX_FILES);
    folderDefaults(child, out);
  }
  return out;
}

function TreeNodes({ node }: { node: FileTreeNode }) {
  return (
    <>
      {[...node.directories.values()].map((directory) => (
        <FileTreeFolder key={directory.path} path={directory.path} name={directory.name}>
          <TreeNodes node={directory} />
        </FileTreeFolder>
      ))}
      {node.files.map((artifact) => {
        const Icon = iconFor(artifact);
        return (
          <FileTreeFile
            key={artifact.path}
            path={artifact.path}
            name={artifact.name}
            title={artifact.path}
            icon={<Icon className="size-3.5 text-muted-foreground" />}
          />
        );
      })}
    </>
  );
}

function WorkspaceTree({
  artifacts,
  selected,
  onSelect,
}: {
  artifacts: ArtifactFile[];
  selected: ArtifactFile | null;
  onSelect: (artifact: ArtifactFile) => void;
}) {
  const tree = useMemo(() => buildTree(artifacts), [artifacts]);
  const defaults = useMemo(() => folderDefaults(tree), [tree]);
  const byPath = useMemo(() => new Map(artifacts.map((a) => [a.path, a])), [artifacts]);
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const expanded = useMemo(
    () => new Set([...defaults].filter(([path, open]) => toggled.get(path) ?? open).map(([path]) => path)),
    [defaults, toggled],
  );
  const toggle = (path: string) => setToggled((prev) => new Map(prev).set(path, !expanded.has(path)));

  return (
    <FileTree
      expanded={expanded}
      selectedPath={selected?.path}
      onSelect={(path) => {
        const artifact = byPath.get(path);
        if (artifact) onSelect(artifact);
        else toggle(path);
      }}
      onExpandedChange={(next) => {
        for (const path of defaults.keys()) {
          if (next.has(path) !== expanded.has(path)) toggle(path);
        }
      }}
      className="rounded-none border-0 bg-transparent font-sans text-xs [&>div]:p-0"
    >
      <TreeNodes node={tree} />
    </FileTree>
  );
}

function ArtifactPreview({ artifact }: { artifact: ArtifactFile }) {
  const isText = canPreviewText(artifact);
  const textQuery = useQuery({
    queryKey: ["artifact-content", artifact.path, artifact.modifiedAt],
    queryFn: () => getArtifactText(artifact.path),
    enabled: isText,
  });
  const contentUrl = artifactContentUrl(artifact.path);

  if (artifact.mimeType.startsWith("image/")) {
    return (
      <div className="flex min-h-64 items-center justify-center p-5">
        <img src={contentUrl} alt={artifact.name} className="max-h-full max-w-full rounded object-contain" />
      </div>
    );
  }
  if (artifact.mimeType === "application/pdf") {
    return <iframe title={artifact.name} src={contentUrl} className="h-full min-h-96 w-full bg-white" />;
  }
  if (isText) {
    if (textQuery.isLoading) {
      return <div className="center-note text-muted-foreground">Loading preview…</div>;
    }
    if (textQuery.isError) {
      return <div className="center-note text-destructive">Preview unavailable.</div>;
    }
    if (artifact.mimeType === "text/markdown") {
      return (
        <article className="artifact-markdown p-6">
          <ReactMarkdown>{textQuery.data}</ReactMarkdown>
        </article>
      );
    }
    return (
      <pre className="min-h-full overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-6">
        {textQuery.data}
      </pre>
    );
  }
  return (
    <div className="center-note min-h-64 text-center text-muted-foreground">
      <File className="size-8 opacity-40" />
      <p>This file can be downloaded but not previewed.</p>
    </div>
  );
}

export function ArtifactPanel({
  artifacts,
  selected,
  onSelect,
  onClose,
  truncated = false,
  loading = false,
  error = null,
}: {
  artifacts: ArtifactFile[];
  truncated?: boolean;
  selected: ArtifactFile | null;
  onSelect: (artifact: ArtifactFile | null) => void;
  onClose?: () => void;
  loading?: boolean;
  error?: Error | null;
}) {
  const closeButton = onClose ? (
    <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close workspace explorer">
      <X />
    </Button>
  ) : null;

  return (
    <section className="artifact-panel relative flex h-full min-h-0 flex-col border-l bg-card">
      <div className="flex min-h-0 flex-1 flex-col" inert={Boolean(selected)}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <FolderOpen className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Workspace</span>
          <span
            className="text-xs text-muted-foreground"
            title={truncated ? "Showing the first files only" : undefined}
          >
            {artifacts.length}
            {truncated ? "+" : ""} files
          </span>
          <span className="ml-auto" />
          {closeButton}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="center-note min-h-40 text-muted-foreground">Loading workspace…</div>
          ) : error ? (
            <div className="center-note min-h-40 text-center text-destructive">
              <p>Could not load the workspace folder.</p>
              <p className="max-w-xs text-xs text-muted-foreground">{error.message}</p>
            </div>
          ) : artifacts.length > 0 ? (
            <WorkspaceTree artifacts={artifacts} selected={selected} onSelect={onSelect} />
          ) : (
            <div className="center-note min-h-40 text-muted-foreground">No files in the workspace.</div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="absolute inset-0 flex min-h-0 flex-col bg-card">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b pr-4 pl-2">
            <Button variant="ghost" size="icon-sm" onClick={() => onSelect(null)} aria-label="Back to files">
              <ArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-xs">{selected.name}</div>
              <div className="truncate text-[10px] text-muted-foreground">{selected.path}</div>
            </div>
            <a
              href={artifactContentUrl(selected.path, true)}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Download ${selected.name}`}
            >
              <Download className="size-4" />
            </a>
            {closeButton}
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <ArtifactPreview artifact={selected} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
