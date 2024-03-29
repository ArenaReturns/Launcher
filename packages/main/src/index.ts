import { app } from "electron";
import "./security-restrictions";
import { restoreOrCreateWindow } from "/@/mainWindow";
import { platform } from "node:process";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import type { ElectronLog } from "electron-log";

app.setAppUserModelId("com.arena-returns.launcher");

/**
 * Prevent electron from running multiple instances.
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", restoreOrCreateWindow);

/**
 * Disable Hardware Acceleration to save more system resources.
 */
app.disableHardwareAcceleration();

/**
 * Shout down background process if all windows was closed
 */
app.on("window-all-closed", () => {
  if (platform !== "darwin") {
    app.quit();
  }
});

/**
 * @see https://www.electronjs.org/docs/latest/api/app#event-activate-macos Event: 'activate'.
 */
app.on("activate", restoreOrCreateWindow);

/**
 * Create the application window when the background process is ready.
 */
app
  .whenReady()
  .then(restoreOrCreateWindow)
  .catch(e => console.error("Failed create window:", e));

autoUpdater.logger = log;
(autoUpdater.logger as ElectronLog).transports.file.level = "info";
app.on("ready", function () {
  autoUpdater.checkForUpdatesAndNotify();
});
