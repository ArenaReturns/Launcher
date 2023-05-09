import type { Manifest } from "../../renderer/src/types";
import { Constants } from "./constants";
import { app, dialog, shell } from "electron";
import got from "got";
import { browserWindow } from "./mainWindow";
import log from "electron-log";

export let manifest: Manifest;

export async function loadManifest() {
  try {
    log.info("Downloading manifest.json");
    manifest = await got.get(`${Constants.CDN_URL}/manifest.json`).json();

    // Automatic updates are only available on Windows
    if (process.platform !== "win32" && manifest.launcherVersion !== app.getVersion()) {
      const response = await dialog.showMessageBox(browserWindow, {
        type: "warning",
        buttons: ["Ignorer", "Télécharger"],
        message:
          "Une nouvelle version du launcher est disponible.\nVotre système ne supportant pas les mises à jour automatique, nous vous invitons à la télécharger manuellement.\nVotre launcher peut ne pas fonctionner correctement tant que vous n'avez pas fait cette mise à jour.",
      });

      if (response && response.response === 1) {
        shell.openExternal("https://launcher.arena-returns.com/download/linux");
        app.quit();
      }
    }
  } catch (err) {
    console.error(err);
    dialog.showErrorBox(
      "Une erreur est survenue",
      "Connexion au serveur de mise à jour impossible !\nVérifiez votre connexion internet et réessayez.\n\nSi le problème persiste, contactez nous sur Discord.",
    );
    app.quit();
  }
}
