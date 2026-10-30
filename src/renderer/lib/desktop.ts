import type { DesktopBridge } from "../../main/preload.ts";

import type { Settings as DesktopSettings } from "../../main/settings.ts";

export type { ProviderId, Settings as DesktopSettings } from "../../main/settings.ts";
export type { SetupStatus, ToolStatus } from "../../main/setup.ts";

declare global {
  interface Window {
    ultrawork?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = window.ultrawork;
export const isDesktop = desktop !== undefined;

export function requireDesktop(): DesktopBridge {
  if (!desktop) throw new Error("This view needs the Ultrawork desktop app");
  return desktop;
}

export function attachmentPaths(files: File[]): string[] {
  if (!desktop) return [];
  return files.map((f) => desktop.pathForFile(f)).filter(Boolean);
}

export function hasApiKey(keys: DesktopSettings["apiKeys"]): boolean {
  return Object.values(keys).some(Boolean);
}
