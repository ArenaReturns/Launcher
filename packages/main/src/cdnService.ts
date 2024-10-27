import { Constants } from "./constants.js";
import { app, dialog, shell } from "electron";
import got from "got";
import { browserWindow } from "./mainWindow.js";
import log from "electron-log";

// TODO: Avoid duplication of types between renderer and main
type CarouselItem = {
  id: number;
  title: string;
  image: string;
  link: string;
};

type Manifest = {
  launcherVersion: string;
  gameVersion: string;
  carousel: Array<CarouselItem>;
};

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
        shell.openExternal(Constants.CDN_URL + "/download/linux");
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
