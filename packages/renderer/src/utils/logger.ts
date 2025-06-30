import log from "electron-log/renderer";

// Configure electron-log for renderer process
log.transports.console.level = import.meta.env.DEV ? "debug" : "info";

// In renderer, we only configure console transport since file transport is handled by main process
log.transports.console.format =
  "[{h}:{i}:{s}.{ms}] [RENDERER] [{level}] {text}";

// Export configured logger
export const logger = log;
export default logger;
