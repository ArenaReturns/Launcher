import { BrowserWindow } from "electron";
import { createRequire } from "node:module";
import * as CdnService from "./cdnService.js";
import * as IPC from "./ipc.js";
import log from "electron-log";

const require = createRequire(import.meta.url);

/**
 * We have to use require.resolve() instead of import.meta.resolve()
 * since vitest doesn't support import.meta.resolve()
 *
 * @see https://github.com/vitest-dev/vitest/pull/5188
 */
const resolve = require.resolve;

export let browserWindow: BrowserWindow;

async function createWindow() {
  await CdnService.loadManifest();

  browserWindow = new BrowserWindow({
    minWidth: 1024,
    minHeight: 576,
    width: 1024,
    height: 576,
    maxWidth: 1366,
    maxHeight: 768,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#3B180E",
    show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Sandbox disabled because the preload script depend on the Node.js api
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
      preload: resolve("@arenareturnslauncher/preload/exposed.mjs"),
    },
  });

  if (process.platform === "linux") {
    log.info("Linux system detected. Disabling resizing as it causes issues with Gnome.");
    browserWindow.setResizable(false);
  }

  browserWindow.setAspectRatio(16 / 9);

  /**
   * If the 'show' property of the BrowserWindow's constructor is omitted from the initialization options,
   * it then defaults to 'true'.
   * This can cause flickering as the window loads the HTML content,
   * and it also has show problematic behavior with the closing of the window.
   * Use `show: false` and listen to the `ready-to-show` event to show the window.
   *
   * @see https://github.com/electron/electron/issues/25012 for the afford mentioned issue.
   */
  browserWindow.on("ready-to-show", () => {
    browserWindow?.show();

    if (import.meta.env.DEV) {
      //browserWindow?.webContents.openDevTools();
    }
  });

  /**
   * Load the main page of the main window.
   */
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    /**
     * Load from the Vite dev server for development.
     */
    await browserWindow.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
  } else {
    /**
     * Load from the local file system for production and test.
     *
     * Use BrowserWindow.loadFile() instead of BrowserWindow.loadURL() for WhatWG URL API limitations
     * when a path contains special characters like `#`.
     * Let electron handle the path quirks.
     * @see https://github.com/nodejs/node/issues/12682
     * @see https://github.com/electron/electron/issues/6869
     */
    await browserWindow.loadFile(resolve("@arenareturnslauncher/renderer"));
  }

  IPC.registerEvents(browserWindow);
  IPC.registerHandlers(browserWindow);

  return browserWindow;
}

/**
 * Restore an existing BrowserWindow or Create a new BrowserWindow.
 */
export async function restoreOrCreateWindow() {
  let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

  if (window === undefined) {
    window = await createWindow();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}
