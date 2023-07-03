import * as path from "path";
import * as fs from "fs";
import { app, dialog, ipcMain, shell } from "electron";
import type { BrowserWindow } from "electron";
import { Constants } from "./constants";
import * as CdnService from "./cdnService";
import * as Updater from "./updater";
import { exec } from "child_process";
import * as Utils from "./utils";
import log from "electron-log";

export enum DebugMode {
  NO_DEBUG,
  JMX,
  AGENT,
  AGENT_SUSPENDED,
}

let launcherReady = false;
let devMode = false;
let devOptions: Record<string, unknown> = {};
let debugMode: DebugMode = DebugMode.NO_DEBUG;

export function registerEvents(mainWindow: BrowserWindow) {
  ipcMain.on("close", () => {
    app.quit();
  });

  ipcMain.on("changeDebugMode", (_event, mode: DebugMode) => {
    debugMode = mode;
  });

  ipcMain.on("toogleDevOption", (_event, newDevOptions) => {
    devOptions = newDevOptions;
  });

  ipcMain.on("clearLogs", () => {
    const baseLogDir = path.join(Constants.GAME_PATH, "game");
    fs.unlinkSync(path.join(baseLogDir, "error.log"));
    fs.unlinkSync(path.join(baseLogDir, "output.log"));
  });

  ipcMain.on("openGameDir", () => {
    shell.openPath(Constants.GAME_PATH).catch(err => {
      dialog.showErrorBox("Erreur", err);
    });
  });

  ipcMain.on("minimize", () => {
    mainWindow.minimize();
  });

  ipcMain.on("repair", () => {
    dialog
      .showMessageBox(mainWindow, {
        type: "question",
        buttons: ["Annuler", "Réparer"],
        title: "Réparation",
        message: "Voulez-vous réparer le client de jeu ?",
        detail: "Cette opération va vérifier tous les fichiers du jeu et télécharger ceux posant problème.",
      })
      .then(result => {
        if (result.response === 1) {
          mainWindow.webContents.send("repairStarted");
        }
      });
  });

  ipcMain.on("openUrl", (_event, url: string) => {
    // Quick security check to make sure we are opening links
    if (!url.startsWith("https://")) {
      return;
    }
    shell.openExternal(url);
  });

  ipcMain.on("enableDevMode", _event => {
    mainWindow.webContents.send("devModeEnabled");
    if (!devMode) {
      devMode = true;
      dialog.showMessageBox(mainWindow, {
        type: "info",
        message: "Mode développeur activé",
      });
      return;
    }

    dialog.showMessageBox(mainWindow, {
      type: "error",
      message: "Le mode développeur est déjà activé",
    });
  });

  ipcMain.on("toggleDevTools", _event => {
    if (!devMode) return;
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    } else {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  ipcMain.on("startUpdate", _event => {
    Updater.startUpdate();
  });

  ipcMain.on("launchGame", _event => {
    if (devMode) {
      log.info("DevMode enabled, checking if we need to inject a localhost config in the client...");
      const gameConfigPath = path.join(Constants.GAME_PATH, "game", "config.properties");
      const gameConfig = fs.readFileSync(gameConfigPath);
      if (gameConfig.includes("127.0.0.1:5555") || gameConfig.includes("localhost:5555")) {
        log.info("Localhost config already present, good!");
      } else {
        log.info("Adding the Localhost config");
        fs.appendFileSync(gameConfigPath, "\r\nproxyGroup_2=Localhost\r\nproxyAddresses_2=127.0.0.1:5555");
      }
    }

    const javaArgs = Utils.buildJavaArgs(process.platform);
    log.info(`Launching game with args: ${javaArgs}`);

    switch (process.platform) {
      case "win32":
        exec(`..\\jre\\bin\\java.exe ${javaArgs}`, {
          cwd: path.join(Constants.GAME_PATH, "game"),
        });
        break;
      case "linux":
        fs.chmodSync(path.join(Constants.GAME_PATH, "jre", "bin", "java"), 0o755);
        exec(`../jre/bin/java ${javaArgs}`, { cwd: path.join(Constants.GAME_PATH, "game") });
        break;
    }
  });
}

export function registerHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle("isUpdateNeeded", async () => {
    const versionFile = path.join(Constants.GAME_PATH, "version.dat");
    if (!fs.existsSync(Constants.GAME_PATH) || !fs.existsSync(versionFile)) {
      return true;
    }
    const localVersion = fs.readFileSync(versionFile, "utf-8");
    if (localVersion === CdnService.manifest.gameVersion) {
      mainWindow.webContents.send("setRepairVisible", true);
      return false;
    }
    return true;
  });

  ipcMain.handle("getCarouselData", async () => {
    return CdnService.manifest.carousel;
  });

  ipcMain.handle("getLauncherReady", async () => {
    return launcherReady;
  });
}

export function isDevMode() {
  return devMode;
}

export function getDebugMode() {
  return debugMode;
}

export function getDevOptions() {
  return devOptions;
}

export function getLauncherReady() {
  return launcherReady;
}

export function setLauncherReady(value: boolean) {
  launcherReady = value;
}
