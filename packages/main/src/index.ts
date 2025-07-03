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

export async function initApp(initConfig: AppInitConfig) {
  // Initialize logging first
  setupLogger();

  const moduleRunner = createModuleRunner()
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
    .init(createGameUpdaterModule())
    .init(createGameClientModule())
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
