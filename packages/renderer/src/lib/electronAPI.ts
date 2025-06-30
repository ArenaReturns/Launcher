// Utility to access electron APIs exposed via base64 encoded keys

function getElectronAPI<T>(key: string): T {
  const encodedKey = btoa(key);
  return (window as unknown as Record<string, unknown>)[encodedKey] as T;
}

// Export typed APIs
export const windowControls = getElectronAPI<WindowControls>("windowControls");
export const system = getElectronAPI<{
  openExternal: (url: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getLogDirectory: () => Promise<string>;
  openLogDirectory: () => Promise<void>;
}>("system");
export const gameClient = getElectronAPI<GameClient>("gameClient");
export const news = getElectronAPI<News>("news");
export const updater = getElectronAPI<Updater>("updater");
export const preloader = getElectronAPI<PreloaderAPI>("preloader");
export const ipcEvents = getElectronAPI<{
  on: (channel: string, listener: (...args: unknown[]) => void) => void;
  off: (channel: string, listener: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}>("ipcEvents");

// Legacy APIs
export const sha256sum =
  getElectronAPI<(data: Buffer | string) => Promise<string>>("sha256sum");
export const versions = getElectronAPI<{
  node: string;
  chrome: string;
  electron: string;
}>("versions");
export const send =
  getElectronAPI<(channel: string, message: string) => Promise<unknown>>(
    "send"
  );
