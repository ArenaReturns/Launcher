import { initApp } from "@app/main";
import { fileURLToPath } from "node:url";

if (
  process.env.NODE_ENV === "development" ||
  process.env.PLAYWRIGHT_TEST === "true" ||
  !!process.env.CI
) {
  function showAndExit(...args) {
    console.error(...args);
    process.exit(1);
  }

  process.on("uncaughtException", showAndExit);
  process.on("unhandledRejection", showAndExit);
}

// noinspection JSIgnoredPromiseFromCall
/**
 * We resolve '@app/renderer' and '@app/preload'
 * here and not in '@app/main'
 * to observe good practices of modular design.
 * This allows fewer dependencies and better separation of concerns in '@app/main'.
 * Thus,
 * the main module remains simplistic and efficient
 * as it receives initialization instructions rather than direct module imports.
 */
initApp({
  renderer:
    // Only use dev server URL in actual development mode
    // Packaged apps run from .asar files, so we can check for that
    process.env.NODE_ENV === "development" &&
    process.env.MODE === "development" &&
    !!process.env.VITE_DEV_SERVER_URL &&
    // Additional check: packaged apps run from .asar archives
    !import.meta.url.includes(".asar")
      ? new URL(process.env.VITE_DEV_SERVER_URL)
      : {
          path: fileURLToPath(import.meta.resolve("@app/renderer")),
        },

  preload: {
    path: fileURLToPath(import.meta.resolve("@app/preload/exposed.mjs")),
  },
});
