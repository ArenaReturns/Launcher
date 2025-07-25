import type { ModuleContext } from "./ModuleContext.js";
import type { GameSettings } from "./modules/GameUpdater.js";

export interface AppModule {
  enable(context: ModuleContext): Promise<void> | void;
  onSettingsUpdate?(settings: GameSettings): void;
}
