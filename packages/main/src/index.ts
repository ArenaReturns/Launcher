import type { AppInitConfig } from "./AppInitConfig.js";
import { setupLogger } from "./utils/logger.js";
import { createModuleRunner } from "./ModuleRunner.js";
import { disallowMultipleAppInstance } from "./modules/SingleInstanceApp.js";
import { createWindowManagerModule } from "./modules/WindowManager.js";
import { terminateAppOnLastWindowClose } from "./modules/ApplicationTerminatorOnLastWindowClose.js";
import { hardwareAccelerationMode } from "./modules/HardwareAccelerationModule.js";
import { autoUpdater } from "./modules/AutoUpdater.js";
import { allowInternalOrigins } from "./modules/BlockNotAllowdOrigins.js";
import { allowExternalUrls } from "./modules/ExternalUrls.js";
import { createGameClientModule } from "./modules/GameClientModule.js";
import { createNewsModule } from "./modules/NewsModule.js";
import { ALLOWED_EXTERNAL_ORIGINS } from "./config/allowedUrls.js";

export async function initApp(initConfig: AppInitConfig) {
  // Initialize logging first
  const logger = setupLogger();

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
    .init(autoUpdater())
    .init(createGameClientModule())
    .init(createNewsModule())

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
