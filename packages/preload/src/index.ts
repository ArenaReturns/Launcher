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
};

// Game client functions
const gameClient = {
  getStatus: () => ipcRenderer.invoke("game:getStatus"),
  checkForUpdates: () => ipcRenderer.invoke("game:checkForUpdates"),
  startDownload: () => ipcRenderer.invoke("game:startDownload"),
  getDownloadProgress: () => ipcRenderer.invoke("game:getDownloadProgress"),
  cancelDownload: () => ipcRenderer.invoke("game:cancelDownload"),
  launchGame: (settings?: any) =>
    ipcRenderer.invoke("game:launchGame", settings),
  repairClient: () => ipcRenderer.invoke("game:repairClient"),
  openGameDirectory: () => ipcRenderer.invoke("game:openGameDirectory"),
  openReplaysFolder: () => ipcRenderer.invoke("game:openReplaysFolder"),
  listReplays: () => ipcRenderer.invoke("game:listReplays"),
  launchReplay: (replayPath: string, settings?: any) =>
    ipcRenderer.invoke("game:launchReplay", replayPath, settings),
  updateSettings: (settings: any) =>
    ipcRenderer.invoke("game:updateSettings", settings),
};

// News functions
const news = {
  getArticles: () => ipcRenderer.invoke("news:getArticles"),
  refreshArticles: () => ipcRenderer.invoke("news:refreshArticles"),
};

// Auto updater functions
const updater = {
  getStatus: () => ipcRenderer.invoke("launcherUpdater:getStatus"),
  checkForUpdates: () => ipcRenderer.invoke("launcherUpdater:checkForUpdates"),
  downloadUpdate: () => ipcRenderer.invoke("launcherUpdater:downloadUpdate"),
  installUpdate: () => ipcRenderer.invoke("launcherUpdater:installUpdate"),
};

// Preloader functions for initialization
const preloader = {
  initializeApp: async () => {
    // Check game status
    const gameStatus = await gameClient.getStatus();

    // Check for app updates
    const updateStatus = await updater.getStatus();
    await updater.checkForUpdates();

    // Preload news (non-blocking)
    news.getArticles().catch(() => {}); // Silently fail

    return {
      gameStatus,
      updateStatus,
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
  gameClient,
  news,
  updater,
  preloader,
};
