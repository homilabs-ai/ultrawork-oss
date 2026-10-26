import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Settings } from "./settings.ts";
import type { SetupStatus } from "./setup.ts";

export interface DesktopBridge {
  platform: NodeJS.Platform;
  settings: {
    get(): Promise<Settings>;
    defaults(): Promise<Settings>;
    save(settings: Settings): Promise<Settings>;
  };
  setup: {
    check(): Promise<SetupStatus>;
    complete(): Promise<Settings>;
  };
  chooseFolder(current?: string): Promise<string | null>;
  revealPath(path: string): Promise<void>;
  pathForFile(file: File): string;
}

const bridge: DesktopBridge = {
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    defaults: () => ipcRenderer.invoke("settings:defaults"),
    save: (settings) => ipcRenderer.invoke("settings:save", settings),
  },
  setup: {
    check: () => ipcRenderer.invoke("setup:check"),
    complete: () => ipcRenderer.invoke("setup:complete"),
  },
  chooseFolder: (current) => ipcRenderer.invoke("dialog:chooseFolder", current),
  revealPath: (p) => ipcRenderer.invoke("shell:reveal", p),
  pathForFile: (file) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld("ultrawork", bridge);
