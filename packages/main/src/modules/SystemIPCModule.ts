import { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { shell, ipcMain, app } from "electron";
import * as path from "path";
import log from "electron-log";
import { isUrlAllowed } from "../config/allowedUrls.js";
import { getSettingsManager } from "../services/SettingsManager.js";
import type { GameSettings } from "./GameUpdater.js";

export class SystemIPCModule implements AppModule {
  private settingsManager = getSettingsManager();

  private registerWindowControlHandlers(): void {
    // Handle external URL opening
    ipcMain.handle("system:openExternal", async (event, url: string) => {
      // Validate URL before opening
      if (!isUrlAllowed(url)) {
        const error = `URL not allowed: ${url}`;
        log.warn(error);
        throw new Error(error);
      }

      try {
        await shell.openExternal(url);
      } catch (error) {
        log.error("Failed to open external URL:", error);
        throw new Error(`Failed to open external URL: ${url}`);
      }
    });

    // Handle app version requests
    ipcMain.handle("system:getAppVersion", () => {
      return app.getVersion();
    });

    // Handle log directory requests
    ipcMain.handle("system:getLogDirectory", () => {
      return path.join(app.getPath("userData"), "logs");
    });

    // Handle opening log directory
    ipcMain.handle("system:openLogDirectory", async () => {
      const logDirectory = path.join(app.getPath("userData"), "logs");

      try {
        await shell.openPath(logDirectory);
      } catch (error) {
        log.error("Failed to open log directory:", error);
        throw new Error(
          `Failed to open log directory: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    });
  }

  private registerSettingsHandlers(): void {
    // Handle settings loading
    ipcMain.handle("system:loadSettings", () => {
      return this.settingsManager.getCurrentSettings();
    });

    // Handle settings saving
    ipcMain.handle(
      "system:saveSettings",
      async (_e, settings: GameSettings) => {
        await this.settingsManager.saveSettings(settings);
      }
    );
  }

  enable(context: ModuleContext): Promise<void> | void {
    log.debug("SystemIPCModule enabled with settings:", context.settings);

    this.registerWindowControlHandlers();
    this.registerSettingsHandlers();
  }
}

export function systemIpcModule(
  ...args: ConstructorParameters<typeof SystemIPCModule>
) {
  return new SystemIPCModule(...args);
}
