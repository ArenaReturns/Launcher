import { versions } from "./versions.js";
import { ipcRenderer } from "electron";

async function sha256sum(data: Buffer | string) {
  return ipcRenderer.invoke("crypto:sha256", data);
}

function send(channel: string, message: string) {
  return ipcRenderer.invoke(channel, message);
}

// IPC event listener functions
const ipcEvents = {
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args));
  },
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    ipcRenderer.off(channel, listener);
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
};

// Window control functions
const windowControls = {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
};

// System functions
const system = {
  openExternal: (url: string) => ipcRenderer.invoke("system:openExternal", url),
  getAppVersion: () => ipcRenderer.invoke("system:getAppVersion"),
  getLogDirectory: () => ipcRenderer.invoke("system:getLogDirectory"),
  openLogDirectory: () => ipcRenderer.invoke("system:openLogDirectory"),
  loadSettings: () => ipcRenderer.invoke("system:loadSettings"),
  saveSettings: (settings: any) =>
    ipcRenderer.invoke("system:saveSettings", settings),
};

// Game updater functions (install / update / download)
const gameUpdater = {
  getStatus: () => ipcRenderer.invoke("gameUpdater:getStatus"),
  checkForUpdates: () => ipcRenderer.invoke("gameUpdater:checkForUpdates"),
  startDownload: () => ipcRenderer.invoke("gameUpdater:startDownload"),
  getDownloadProgress: () =>
    ipcRenderer.invoke("gameUpdater:getDownloadProgress"),
  cancelDownload: () => ipcRenderer.invoke("gameUpdater:cancelDownload"),
  repairClient: () => ipcRenderer.invoke("gameUpdater:repairClient"),
  openGameDirectory: () => ipcRenderer.invoke("gameUpdater:openGameDirectory"),
};

// Game client functions (launching, replays)
const gameClient = {
  launchGame: () => ipcRenderer.invoke("gameClient:launchGame"),
  openReplaysFolder: () => ipcRenderer.invoke("gameClient:openReplaysFolder"),
  listReplays: () => ipcRenderer.invoke("gameClient:listReplays"),
  launchReplayOffline: (replayPath: string) =>
    ipcRenderer.invoke("gameClient:launchReplayOffline", replayPath),
};

// News functions
const news = {
  getArticles: () => ipcRenderer.invoke("news:getArticles"),
  refreshArticles: () => ipcRenderer.invoke("news:refreshArticles"),
};

// Launcher updater functions
const launcherUpdater = {
  getStatus: () => ipcRenderer.invoke("launcherUpdater:getStatus"),
  checkForUpdates: () => ipcRenderer.invoke("launcherUpdater:checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("launcherUpdater:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("launcherUpdater:installUpdate"),
};

// Preloader functions for initialization
const preloader = {
  initializeApp: async () => {
    // Check game status
    const gameStatus = await gameUpdater.getStatus();

    // Check for launcher updates
    const launcherUpdateStatus = await launcherUpdater.getStatus();
    await launcherUpdater.checkForUpdates();

    // Preload news (non-blocking)
    news.getArticles().catch(() => {}); // Silently fail

    return {
      gameStatus,
      launcherUpdateStatus,
    };
  },
};

export {
  sha256sum,
  versions,
  send,
  ipcEvents,
  windowControls,
  system,
  gameUpdater,
  gameClient,
  news,
  launcherUpdater,
  preloader,
};
