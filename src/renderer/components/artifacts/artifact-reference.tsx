import { useNavigate } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { artifactContentUrl } from "@/api/runs";
import { useArtifacts } from "@/hooks/use-runs";
import { cn } from "@/lib/utils";
import type { ArtifactFile } from "@/types/runs";

type OpenArtifact = (artifact: ArtifactFile) => void;

function useArtifactLinks(): { links: ArtifactLinks; open: OpenArtifact } {
  const links = artifactLinks(useArtifacts().data?.artifacts ?? NO_ARTIFACTS);
  const navigate = useNavigate();
  const open: OpenArtifact = (artifact) =>
    navigate({ to: ".", search: (previous) => ({ ...previous, artifact: artifact.path }), replace: true });
  return { links, open };
}

const NO_ARTIFACTS: ArtifactFile[] = [];

type ArtifactLinks = {
  byPath: Map<string, ArtifactFile>;
  pattern: RegExp | null;
};

const linksCache = new WeakMap<ArtifactFile[], ArtifactLinks>();

function artifactLinks(artifacts: ArtifactFile[]): ArtifactLinks {
  const cached = linksCache.get(artifacts);
  if (cached) return cached;
  const byPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  const paths = artifacts
    .flatMap((artifact) => [artifact.path, `/workspace/${artifact.path}`])
    .toSorted((a, b) => b.length - a.length);
  const escaped = paths.map((path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let pattern: RegExp | null = null;
  try {
    pattern = paths.length > 0 ? new RegExp(`(${escaped.join("|")})`, "g") : null;
  } catch {
  }
  const links = { byPath, pattern };
  linksCache.set(artifacts, links);
  return links;
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/^['"`([]+|['"`)\],.;:]+$/g, "")
    .replace(/^\/workspace\//, "");
}

function matchingArtifact(value: string, links: ArtifactLinks): ArtifactFile | null {
  return links.byPath.get(normalizePath(value)) ?? null;
}

export function ArtifactReference({
  artifact,
  children,
  onOpen,
  className,
}: {
  artifact: ArtifactFile;
  children?: ReactNode;
  onOpen: OpenArtifact;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(artifact)}
      title={`Preview ${artifact.path}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded bg-status-active/10 px-1 py-0.5 font-mono text-[0.9em] text-status-active transition-colors hover:bg-status-active/20",
        className,
      )}
    >
      <FileText className="size-3 shrink-0" />
      <span className="truncate">{children ?? artifact.path}</span>
    </button>
  );
}

export function ArtifactText({ children }: { children: string }) {
  const { links, open } = useArtifactLinks();
  return linkArtifacts(children, links, open);
}

function linkArtifacts(children: string, links: ArtifactLinks, onOpen: OpenArtifact): ReactNode {
  if (!links.pattern) return children;
  return children.split(links.pattern).map((part, index) => {
    const artifact = matchingArtifact(part, links);
    return artifact ? (
      <ArtifactReference key={`${part}:${index}`} artifact={artifact} onOpen={onOpen}>
        {part}
      </ArtifactReference>
    ) : (
      part
    );
  });
}

function artifactChildren(children: ReactNode, links: ArtifactLinks, onOpen: OpenArtifact): ReactNode {
  if (typeof children === "string") return linkArtifacts(children, links, onOpen);
  if (Array.isArray(children)) {
    return children.map((child, index) => <span key={index}>{artifactChildren(child, links, onOpen)}</span>);
  }
  return children;
}

export function ArtifactMarkdown({ children }: { children: string }) {
  const { links, open: onOpen } = useArtifactLinks();
  return (
    <ReactMarkdown
      components={{
        p: ({ children: content }) => <p>{artifactChildren(content, links, onOpen)}</p>,
        li: ({ children: content }) => <li>{artifactChildren(content, links, onOpen)}</li>,
        a: ({ href, children: content }) => {
          const artifact = href ? matchingArtifact(href, links) : null;
          if (artifact) {
            return (
              <ArtifactReference artifact={artifact} onOpen={onOpen}>
                {content}
              </ArtifactReference>
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {content}
            </a>
          );
        },
        img: ({ src, alt }) => {
          const artifact = src ? matchingArtifact(src, links) : null;
          const resolved = artifact ? artifactContentUrl(artifact.path) : src;
          if (!resolved) return null;
          return (
            <button
              type="button"
              className="block max-w-full text-left"
              onClick={() => artifact && onOpen(artifact)}
              disabled={!artifact}
            >
              <img src={resolved} alt={alt ?? ""} />
            </button>
          );
        },
        code: ({ children: content }) => {
          const value = String(content);
          const artifact = matchingArtifact(value, links);
          return artifact ? (
            <ArtifactReference artifact={artifact} onOpen={onOpen}>
              {value}
            </ArtifactReference>
          ) : (
            <code>{content}</code>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
