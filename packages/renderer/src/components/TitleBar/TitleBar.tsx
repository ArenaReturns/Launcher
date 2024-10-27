import { ipcSend, ipcOn } from "@arenareturnslauncher/preload";
import type React from "react";
import { useEffect, useState } from "react";
import styles from "./TitleBar.module.scss";
import { DebugMode } from "../../types";

type DevOptions = {
  dumpMixinified: boolean;
  printMixinsLoadOrder: boolean;
  launchGame: boolean;
  applyMixins: boolean;
  discordIntegration: boolean;
  redirectLogs: boolean;
};

export const TitleBar = () => {
  const [repairVisible, setRepairVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [devMode, toggleDevMode] = useState(false);
  const [debugMode, setDebugMode] = useState<DebugMode>(DebugMode.NO_DEBUG);

  const [devOptions, setDevOptions] = useState<DevOptions>({
    dumpMixinified: false,
    printMixinsLoadOrder: false,
    launchGame: true,
    applyMixins: true,
    discordIntegration: true,
    redirectLogs: true,
  });

  const toogleDevOption = (e: React.MouseEvent<HTMLLIElement>, type: keyof DevOptions) => {
    setDevOptions(prevState => ({
      ...prevState,
      [type]: !prevState[type],
    }));
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  useEffect(() => {
    ipcSend("toogleDevOption", devOptions);
  }, [devOptions]);

  const handleChange = () => {
    setMenuVisible(!menuVisible);
  };

  const openGameDir = (e: React.MouseEvent<HTMLLIElement>) => {
    ipcSend("openGameDir");
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  const openStatus = (e: React.MouseEvent<HTMLLIElement>) => {
    ipcSend("openUrl", "https://status.arena-returns.com/");
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  const closeApp = () => {
    ipcSend("close");
  };

  const minimizeApp = () => {
    ipcSend("minimize");
  };

  const nextDebugMode = (e: React.MouseEvent<HTMLLIElement>) => {
    const next: DebugMode = (debugMode + 1) % DebugMode.__LENGTH;
    setDebugMode(next);
    ipcSend("changeDebugMode", next);
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  const clearLogs = () => {
    ipcSend("clearLogs");
  };

  const repairApp = () => {
    ipcSend("repair");
  };

  useEffect(() => {
    ipcOn("setRepairVisible", (_event: Event, visible: boolean) => {
      setRepairVisible(visible);
    });
    ipcOn("devModeEnabled", (_event: Event) => {
      toggleDevMode(true);
    });
  }, []);

  return (
    <div className={styles.TitleBar}>
      <div className={styles.left}>
        <div className={styles.hamMenuOpenerButton} onClick={handleChange} data-checked={menuVisible} />
        <div className={styles.hamMenu} onClick={handleChange}>
          <ul>
            <li onClick={openStatus} className={styles.iconStatus}>
              Voir le status des services
            </li>
            {repairVisible && (
              <li onClick={openGameDir} className={styles.iconOpen}>
                Ouvrir le dossier du jeu
              </li>
            )}
            {repairVisible && (
              <li onClick={repairApp} className={styles.iconRepair}>
                Réparer
              </li>
            )}

            {/* Dev mode options*/}
            {devMode && repairVisible && (
              <li onClick={clearLogs} className={styles.clearLogs}>
                Effacer les logs
              </li>
            )}
            {devMode && <li onClick={nextDebugMode}>Debug mode: {DebugMode[debugMode]}</li>}
            {devMode && <li onClick={e => toogleDevOption(e, "dumpMixinified")}>{devOptions["dumpMixinified"] ? "✔" : "✘"} Dump mixinified</li>}
            {devMode && (
              <li onClick={e => toogleDevOption(e, "printMixinsLoadOrder")}>{devOptions["printMixinsLoadOrder"] ? "✔" : "✘"} Print mixins order</li>
            )}
            {devMode && <li onClick={e => toogleDevOption(e, "applyMixins")}>{devOptions["applyMixins"] ? "✔" : "✘"} Apply mixins</li>}
            {devMode && (
              <li onClick={e => toogleDevOption(e, "discordIntegration")}>{devOptions["discordIntegration"] ? "✔" : "✘"} Discord Integration</li>
            )}
            {devMode && <li onClick={e => toogleDevOption(e, "redirectLogs")}>{devOptions["redirectLogs"] ? "✔" : "✘"} Redirect logs</li>}
            {devMode && <li onClick={e => toogleDevOption(e, "launchGame")}>{devOptions["launchGame"] ? "✘" : "✔"} Do not start game</li>}
          </ul>
          <div className={styles.appVersion}>v{import.meta.env.VITE_APP_VERSION}</div>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.minimizeButton} onClick={minimizeApp} />
        <div className={styles.closeButton} onClick={closeApp} />
      </div>
    </div>
  );
};
