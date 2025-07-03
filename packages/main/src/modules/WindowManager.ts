import type { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { BrowserWindow, ipcMain, app, shell } from "electron";
import type { AppInitConfig } from "../AppInitConfig.js";
import { isUrlAllowed } from "../config/allowedUrls.js";
import { join } from "path";
import log from "electron-log";

class WindowManager implements AppModule {
  readonly #preload: { path: string };
  readonly #renderer: { path: string } | URL;
  readonly #openDevTools;

  constructor({
    initConfig,
    openDevTools = false,
  }: {
    initConfig: AppInitConfig;
    openDevTools?: boolean;
  }) {
    this.#preload = initConfig.preload;
    this.#renderer = initConfig.renderer;
    this.#openDevTools = openDevTools;
  }

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();

    // Register window control handlers
    this.registerWindowControlHandlers();

    await this.restoreOrCreateWindow(true);
    app.on("second-instance", () => this.restoreOrCreateWindow(true));
    app.on("activate", () => this.restoreOrCreateWindow(true));
  }

  private registerWindowControlHandlers(): void {
    ipcMain.handle("window:minimize", () => {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.minimize();
      }
    });

    ipcMain.handle("window:close", () => {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.close();
      }
    });
  }

  async createWindow(): Promise<BrowserWindow> {
    const browserWindow = new BrowserWindow({
      show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
      frame: false, // Remove native window decorations
      backgroundColor: "#000000", // Black background to prevent white flash during resize
      maximizable: false, // Prevent window maximizing
      minWidth: 1280,
      minHeight: 720,
      maxWidth: 1440,
      maxHeight: 900,
      width: 1280,
      height: 720,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Disable sandbox to allow window controls
        webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
        preload: this.#preload.path,
        devTools: import.meta.env.DEV, // Only enable dev tools in development
      },
    });

    // Handle dev tools shortcuts
    browserWindow.webContents.on("before-input-event", (event, input) => {
      // Check for dev tools shortcuts
      const isDevToolsShortcut =
        input.key === "F12" ||
        (input.control && input.shift && input.key === "I") ||
        (input.meta && input.shift && input.key === "I");

      if (isDevToolsShortcut) {
        event.preventDefault();

        if (import.meta.env.DEV) {
          // In development, open dev tools detached
          if (browserWindow.webContents.isDevToolsOpened()) {
            browserWindow.webContents.closeDevTools();
          } else {
            browserWindow.webContents.openDevTools({ mode: "detach" });
          }
        }
        // In production, shortcuts are blocked (do nothing)
      }
    });

    if (this.#renderer instanceof URL) {
      await browserWindow.loadURL(this.#renderer.href);
    } else {
      await browserWindow.loadFile(this.#renderer.path);
    }

    return browserWindow;
  }

  async restoreOrCreateWindow(show = false) {
    let window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

    if (window === undefined) {
      window = await this.createWindow();
    }

    if (!show) {
      return window;
    }

    if (window.isMinimized()) {
      window.restore();
    }

    window?.show();

    if (this.#openDevTools) {
      window?.webContents.openDevTools({ mode: "detach" });
    }

    window.focus();

    return window;
  }
}

export function createWindowManagerModule(
  ...args: ConstructorParameters<typeof WindowManager>
) {
  return new WindowManager(...args);
}
