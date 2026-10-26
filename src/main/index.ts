import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { defaultSettings, type Settings, SettingsStore, settingsToEnv } from "./settings.ts";
import { checkSetup, refreshPath } from "./setup.ts";

const ROOT = app.getAppPath();
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT || 4317);
const READY_TIMEOUT_MS = 60_000;
const DEV_UI_URL = process.env.ULTRAWORK_DEV_UI;
const APP_URL = DEV_UI_URL ?? `http://127.0.0.1:${PORT}/`;

if (!app.isPackaged && process.env.ULTRAWORK_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.ULTRAWORK_USER_DATA));
}

let gateway: ChildProcess | null = null;
let gatewayPath: string | undefined;
let restarting = false;
let quitting = false;

interface GatewayLaunch {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

function gatewayLaunch(): GatewayLaunch {
  const res = process.resourcesPath;
  const compiled = path.join(res, "gateway", "ultrawork-gateway");
  if (app.isPackaged && fs.existsSync(compiled)) {
    return {
      command: compiled,
      args: [],
      cwd: app.getPath("userData"),
      env: {
        WEB_DIST: path.join(res, "renderer"),
        MIGRATIONS_DIR: path.join(res, "drizzle"),
        CHROME_MCP_ENTRY: path.join(res, "chrome-devtools-mcp", "build", "src", "bin", "chrome-devtools-mcp.js"),
      },
    };
  }
  return {
    command: "bun",
    args: DEV_UI_URL ? ["--watch", "src/server/index.ts"] : ["run", path.join(ROOT, "src", "server", "index.ts")],
    cwd: ROOT,
    env: { WEB_DIST: path.join(DIST, "renderer") },
  };
}

function waitForGateway(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`Gateway did not start on port ${PORT}.`));
      setTimeout(attempt, 250);
    };
    const attempt = () => {
      if (!gateway) return reject(new Error("Gateway exited before becoming ready."));
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => req.destroy());
    };
    attempt();
  });
}

function startGateway(settings: Settings): Promise<void> {
  const launch = gatewayLaunch();
  const env = {
    ...process.env,
    ...settingsToEnv(settings),
    ...launch.env,
    PORT: String(PORT),
    DB_PATH: path.join(app.getPath("userData"), "harness.db"),
  };

  const child = spawn(launch.command, launch.args, {
    cwd: launch.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  gateway = child;
  gatewayPath = process.env.PATH;
  child.stdout?.on("data", (b) => process.stdout.write(`[gateway] ${b}`));
  child.stderr?.on("data", (b) => process.stderr.write(`[gateway] ${b}`));
  child.on("exit", (code, signal) => {
    if (gateway === child) gateway = null;
    if (!quitting && !restarting) {
      dialog.showErrorBox("Ultrawork stopped", `The local gateway exited (code=${code}, signal=${signal}).`);
      app.quit();
    }
  });
  return waitForGateway();
}

function stopGateway(): Promise<void> {
  const child = gateway;
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function restartGateway(settings: Settings): Promise<void> {
  restarting = true;
  try {
    await stopGateway();
    await startGateway(settings);
  } finally {
    restarting = false;
  }
}

function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
}

function openExternal(url: string): void {
  const protocol = new URL(url).protocol;
  if (protocol === "https:" || protocol === "http:" || protocol === "mailto:") void shell.openExternal(url);
}

function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Ultrawork",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(DIST, "main", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  return win.loadURL(APP_URL);
}

function registerIpc(store: SettingsStore): void {
  ipcMain.handle("settings:get", () => store.load());
  ipcMain.handle("settings:defaults", () => defaultSettings());
  ipcMain.handle("settings:save", async (_e, settings: Settings) => {
    store.save(settings);
    await restartGateway(settings);
    return store.load();
  });
  ipcMain.handle("setup:check", () => checkSetup(store.load()));
  ipcMain.handle("setup:complete", async () => {
    const settings = { ...store.load(), setupDone: true };
    store.save(settings);
    await refreshPath();
    if (process.env.PATH !== gatewayPath) await restartGateway(settings);
    return settings;
  });
  ipcMain.handle("dialog:chooseFolder", async (_e, current?: string) => {
    const result = await dialog.showOpenDialog({
      defaultPath: current,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("shell:reveal", (_e, p: string) => shell.showItemInFolder(p));
}

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function setupAutoUpdate(): void {
  if (!app.isPackaged) return;
  autoUpdater.logger = console;
  let prompted = false;
  autoUpdater.on("error", (err) => console.error("[updater]", err));
  autoUpdater.on("update-downloaded", async (info) => {
    if (prompted) return;
    prompted = true;
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Ultrawork ${info.version} is ready`,
      detail: "Restart to install the update. Otherwise it installs the next time you quit.",
    });
    if (response === 0) {
      quitting = true;
      await stopGateway();
      autoUpdater.quitAndInstall();
    }
  });
  const check = () => void autoUpdater.checkForUpdates().catch((err) => console.error("[updater]", err));
  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  const store = new SettingsStore(app.getPath("userData"));
  const settings = store.load();
  if (!fs.existsSync(store.file)) store.save(settings);
  registerIpc(store);

  const devIcon = path.join(ROOT, "resources", "icon.png");
  if (!app.isPackaged && process.platform === "darwin" && fs.existsSync(devIcon)) app.dock?.setIcon(devIcon);

  try {
    await refreshPath();
    await startGateway(settings);
    await createWindow();
    setupAutoUpdate();
  } catch (err) {
    dialog.showErrorBox("Failed to start Ultrawork", String(err));
    await stopGateway();
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  void stopGateway();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
