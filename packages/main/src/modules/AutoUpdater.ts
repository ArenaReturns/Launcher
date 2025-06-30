import { AppModule } from "../AppModule.js";
import { ModuleContext } from "../ModuleContext.js";
import { ipcMain, BrowserWindow, dialog } from "electron";
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
} from "electron-updater";
import log from "electron-log";

type DownloadNotification = Parameters<
  AppUpdater["checkForUpdatesAndNotify"]
>[0];

export interface UpdateProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface UpdateStatus {
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  error?: string;
  progress?: UpdateProgress;
  version?: string;
}

export class AutoUpdater implements AppModule {
  readonly #notification: DownloadNotification;
  private updateStatus: UpdateStatus;
  private lastCheckTime: number = 0;
  private readonly CHECK_COOLDOWN_MS = 5000; // Prevent checks more frequent than 5 seconds

  constructor({
    downloadNotification = undefined,
  }: {
    downloadNotification?: DownloadNotification;
  } = {}) {
    this.#notification = downloadNotification;
    this.updateStatus = {
      available: false,
      downloading: false,
      downloaded: false,
    };
  }

  async enable(context: ModuleContext): Promise<void> {
    log.info("AutoUpdater: Initializing auto-updater module");

    // Register IPC handlers
    ipcMain.handle("updater:getStatus", () => this.getUpdateStatus());
    ipcMain.handle("updater:checkForUpdates", () => this.checkForUpdates());
    ipcMain.handle("updater:downloadUpdate", () => this.downloadUpdate());
    ipcMain.handle("updater:installUpdate", () =>
      this.installUpdateWithConfirmation()
    );

    // Setup event listeners
    this.setupEventListeners();

    log.info("AutoUpdater: Module initialized successfully");
  }

  getAutoUpdater(): AppUpdater {
    // Using destructuring to access autoUpdater due to the CommonJS module of 'electron-updater'.
    // It is a workaround for ESM compatibility issues, see https://github.com/electron-userland/electron-builder/issues/7976.
    const { autoUpdater } = electronUpdater;
    return autoUpdater;
  }

  private setupEventListeners(): void {
    const updater = this.getAutoUpdater();
    log.info("AutoUpdater: Setting up event listeners");

    // Configure electron-updater to use our electron-log instance
    updater.logger = log;
    // Configure transport level on our log instance (same object)
    log.transports.file.level = "info";
    log.info("AutoUpdater: Configured electron-updater logging");

    // Force dev update config for debugging
    // updater.forceDevUpdateConfig = true;

    updater.on("update-available", (info) => {
      log.info("AutoUpdater: Update available", {
        version: info.version,
        releaseDate: info.releaseDate,
      });
      this.updateStatus = {
        ...this.updateStatus,
        available: true,
        version: info.version,
      };
      this.notifyRenderer("update-available", this.updateStatus);
    });

    updater.on("update-not-available", () => {
      log.info("AutoUpdater: No updates available");
      this.updateStatus = {
        ...this.updateStatus,
        available: false,
      };
      this.notifyRenderer("update-not-available", this.updateStatus);
    });

    updater.on("download-progress", (progress: ProgressInfo) => {
      log.debug("AutoUpdater: Download progress", {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
        speed: progress.bytesPerSecond,
      });
      this.updateStatus = {
        ...this.updateStatus,
        downloading: true,
        progress: {
          bytesPerSecond: progress.bytesPerSecond,
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
        },
      };
      this.notifyRenderer("download-progress", this.updateStatus);
    });

    updater.on("update-downloaded", () => {
      log.info("AutoUpdater: Update downloaded successfully");
      this.updateStatus = {
        ...this.updateStatus,
        downloading: false,
        downloaded: true,
      };
      this.notifyRenderer("update-downloaded", this.updateStatus);
    });

    updater.on("error", (error) => {
      log.error("AutoUpdater: Error occurred", error);
      this.updateStatus = {
        ...this.updateStatus,
        downloading: false,
        error: error.message,
      };
      this.notifyRenderer("update-error", this.updateStatus);
    });
  }

  private notifyRenderer(event: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(`updater:${event}`, data);
      }
    });
  }

  getUpdateStatus(): UpdateStatus {
    return this.updateStatus;
  }

  async checkForUpdates(): Promise<boolean> {
    // Prevent rapid successive calls
    const now = Date.now();
    if (now - this.lastCheckTime < this.CHECK_COOLDOWN_MS) {
      log.debug(
        "AutoUpdater: Skipping update check - too soon after last check",
        {
          timeSinceLastCheck: now - this.lastCheckTime,
          cooldownMs: this.CHECK_COOLDOWN_MS,
        }
      );
      return false;
    }
    this.lastCheckTime = now;

    const updater = this.getAutoUpdater();
    try {
      log.info("AutoUpdater: Checking for updates");
      updater.fullChangelog = true;

      if (import.meta.env.VITE_DISTRIBUTION_CHANNEL) {
        log.info(
          "AutoUpdater: Using distribution channel",
          import.meta.env.VITE_DISTRIBUTION_CHANNEL
        );
        updater.channel = import.meta.env.VITE_DISTRIBUTION_CHANNEL;
      }

      // Reset update status before checking
      this.updateStatus = {
        ...this.updateStatus,
        available: false,
        error: undefined,
      };

      const result = await updater.checkForUpdates();

      // In development mode, checkForUpdates() returns null when skipped
      // In production, it returns an UpdateCheckResult object even when no update is available
      // We need to check the updateStatus.available flag that gets set by events
      const hasUpdate = result !== null && this.updateStatus.available;
      log.info("AutoUpdater: Check for updates completed", {
        hasUpdate,
        resultExists: !!result,
      });

      return hasUpdate;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("No published versions")) {
          log.warn("AutoUpdater: No published versions available");
          return false;
        }
        log.error("AutoUpdater: Failed to check for updates", error);
      }

      throw error;
    }
  }

  async downloadUpdate(): Promise<void> {
    const updater = this.getAutoUpdater();
    if (this.updateStatus.available) {
      log.info("AutoUpdater: Starting update download");
      await updater.downloadUpdate();
    } else {
      log.warn("AutoUpdater: Attempted to download update but none available");
    }
  }

  installUpdate(): void {
    const updater = this.getAutoUpdater();
    if (this.updateStatus.downloaded) {
      log.info("AutoUpdater: Installing update and restarting application");
      updater.quitAndInstall();
    } else {
      log.warn("AutoUpdater: Attempted to install update but none downloaded");
    }
  }

  async installUpdateWithConfirmation(): Promise<void> {
    log.info("AutoUpdater: installUpdateWithConfirmation called", {
      downloaded: this.updateStatus.downloaded,
      version: this.updateStatus.version,
    });

    if (!this.updateStatus.downloaded) {
      log.warn("AutoUpdater: Attempted to install update but none downloaded");
      return;
    }

    try {
      log.info("AutoUpdater: Showing mandatory update installation dialog");

      const allWindows = BrowserWindow.getAllWindows();
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const targetWindow = focusedWindow || allWindows[0];

      log.info("AutoUpdater: Window context", {
        allWindowsCount: allWindows.length,
        hasFocusedWindow: !!focusedWindow,
        targetWindowExists: !!targetWindow,
      });

      if (!targetWindow) {
        log.error(
          "AutoUpdater: No window available for dialog, installing directly"
        );
        this.installUpdate();
        return;
      }

      const result = await dialog.showMessageBox(targetWindow, {
        type: "info",
        title: "Mise à jour obligatoire",
        message: "Une mise à jour du launcher a été téléchargée",
        detail: `Version ${
          this.updateStatus.version || "inconnue"
        }\n\nCette mise à jour est obligatoire. Le launcher va maintenant se fermer pour installer la mise à jour.\n\nVous pourrez relancer le launcher après sa fermeture si celui-ci ne se relance pas automatiquement.`,
        buttons: ["Installer maintenant"],
        defaultId: 0,
        cancelId: -1, // No cancel button
        noLink: true,
        icon: undefined, // Use default icon
      });

      log.info("AutoUpdater: Dialog result", { response: result.response });
      log.info("AutoUpdater: Proceeding with mandatory update installation");
      this.installUpdate();
    } catch (error) {
      log.error("AutoUpdater: Failed to show confirmation dialog", error);
      // Always install even if dialog fails - it's mandatory
      log.info("AutoUpdater: Installing update anyway (mandatory)");
      this.installUpdate();
    }
  }

  async runAutoUpdater(): Promise<boolean> {
    const updater = this.getAutoUpdater();
    try {
      log.info("AutoUpdater: Running auto-updater with notifications");
      updater.fullChangelog = true;

      if (import.meta.env.VITE_DISTRIBUTION_CHANNEL) {
        log.info(
          "AutoUpdater: Using distribution channel for auto-updater",
          import.meta.env.VITE_DISTRIBUTION_CHANNEL
        );
        updater.channel = import.meta.env.VITE_DISTRIBUTION_CHANNEL;
      }

      const result = await updater.checkForUpdatesAndNotify(this.#notification);
      const hasUpdate = !!result;
      log.info("AutoUpdater: Auto-updater completed", { hasUpdate });
      return hasUpdate;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("No published versions")) {
          log.warn(
            "AutoUpdater: No published versions available for auto-updater"
          );
          return false;
        }
        log.error("AutoUpdater: Auto-updater failed", error);
      }

      throw error;
    }
  }
}

export function autoUpdater(
  ...args: ConstructorParameters<typeof AutoUpdater>
) {
  return new AutoUpdater(...args);
}
