import electron from "electron";
const { ipcRenderer } = electron;

export function ipcSend(channel: string, ...args: any[]) {
  ipcRenderer.send(channel, ...args);
}

export function ipcInvoke(channel: string, ...args: any[]): Promise<any> {
  return ipcRenderer.invoke(channel, ...args);
}

export function ipcOn(channel: string, listener: (...args: any[]) => void) {
  ipcRenderer.on(channel, listener);
}

export function ipcRemoveListener(channel: string, listener: (...args: any[]) => void) {
  ipcRenderer.removeListener(channel, listener);
}
