import { type ReactNode, useEffect, useRef } from "react";

export function ChatColumn({ children, composer }: Readonly<{ children: ReactNode; composer: ReactNode }>) {
  const columnRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const column = columnRef.current;
    const composerEl = composerRef.current;
    if (!column || !composerEl) return;

    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize?.[0]?.blockSize ?? 0;
      column.style.setProperty("--chat-composer-space", `${height + 24}px`);
    });
    observer.observe(composerEl);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="chat-column flex min-h-0 min-w-0 flex-1 flex-col" ref={columnRef}>
      <div className="min-h-0 flex-1">{children}</div>
      <div className="chat-composer-floating">
        <div aria-hidden="true" className="chat-composer-scrim" />
        <div className="chat-composer-hold" ref={composerRef}>
          {composer}
        </div>
      </div>
    </div>
  );
}
