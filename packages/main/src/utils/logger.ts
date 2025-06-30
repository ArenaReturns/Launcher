import log from "electron-log";
import { app } from "electron";
import { join } from "path";

// Flag to prevent multiple logger setups
let isLoggerSetup = false;

// Configure electron-log
export function setupLogger() {
  // Prevent multiple setups
  if (isLoggerSetup) {
    return log;
  }
  isLoggerSetup = true;
  // Set log level based on environment
  log.transports.console.level = import.meta.env.DEV ? "debug" : "info";
  log.transports.file.level = "info";

  // Configure file transport with date-based naming
  log.transports.file.resolvePathFn = (variables) => {
    // Create date-based filename
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const fileName = `launcher-${year}-${month}-${day}.log`;

    return join(app.getPath("userData"), "logs", fileName);
  };

  // Configure file rotation
  log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB

  // Format log messages
  log.transports.file.format =
    "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
  log.transports.console.format = "[{h}:{i}:{s}.{ms}] [{level}] {text}";

  // Log startup info
  log.info("=== Launcher Started ===");
  log.info("App Version:", app.getVersion());
  log.info("Electron Version:", process.versions.electron);
  log.info("Platform:", process.platform);
  log.info("Architecture:", process.arch);
  log.info("Log Directory:", join(app.getPath("userData"), "logs"));

  return log;
}

// Export configured logger
export const logger = setupLogger();
export default logger;
