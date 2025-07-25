import type { AppInitConfig } from "./AppInitConfig.js";
import { setupLogger } from "./utils/logger.js";
import { createModuleRunner } from "./ModuleRunner.js";
import { disallowMultipleAppInstance } from "./modules/SingleInstanceApp.js";
import { createWindowManagerModule } from "./modules/WindowManager.js";
import { terminateAppOnLastWindowClose } from "./modules/ApplicationTerminatorOnLastWindowClose.js";
import { hardwareAccelerationMode } from "./modules/HardwareAccelerationModule.js";
import { launcherUpdater } from "./modules/LauncherUpdater.js";
import { allowInternalOrigins } from "./modules/BlockNotAllowedOrigins.js";
import { allowExternalUrls } from "./modules/ExternalUrls.js";
import { createGameUpdaterModule } from "./modules/GameUpdater.js";
import { createGameClientModule } from "./modules/GameClient.js";
import { createNewsModule } from "./modules/NewsModule.js";
import { systemIpcModule } from "./modules/SystemIPCModule.js";
import { ALLOWED_EXTERNAL_ORIGINS } from "./config/allowedUrls.js";
import { getSettingsManager } from "./services/SettingsManager.js";
import { app } from "electron";
import type { ModuleContext } from "./ModuleContext.js";

export async function initApp(initConfig: AppInitConfig) {
  // Initialize logging first
  setupLogger();

  // Load settings before any modules are initialized
  const settingsManager = getSettingsManager();
  const settings = await settingsManager.loadSettings();

  // Create module context with settings
  const moduleContext: ModuleContext = {
    app,
    settings,
    onSettingsChange: settingsManager.onSettingsChange.bind(settingsManager),
  };

  // Create module instances (now they have access to settings from the start)
  const gameUpdater = createGameUpdaterModule();
  const gameClient = createGameClientModule();

  // Connect the modules so GameClient can call GameUpdater methods
  gameClient.setGameUpdater(gameUpdater);

  const moduleRunner = createModuleRunner(moduleContext)
    .init(
      createWindowManagerModule({
        initConfig,
        openDevTools: import.meta.env.DEV,
      })
    )
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({ enable: true }))
    .init(launcherUpdater())
    .init(gameUpdater)
    .init(gameClient)
    .init(createNewsModule())
    .init(systemIpcModule())

    // Security
    .init(
      allowInternalOrigins(
        new Set(
          initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []
        )
      )
    )
    .init(
      allowExternalUrls(
        initConfig.renderer instanceof URL
          ? ALLOWED_EXTERNAL_ORIGINS
          : new Set()
      )
    );

  await moduleRunner;
}
