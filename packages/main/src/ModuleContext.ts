import type { GameSettings } from "./modules/GameUpdater.js";

export type ModuleContext = {
  readonly app: Electron.App;
  readonly settings: GameSettings;
  readonly onSettingsChange: (
    callback: (settings: GameSettings) => void
  ) => () => void;
};
