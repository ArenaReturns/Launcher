import React, { useEffect, useState } from "react";
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
    window.api.ipc.send("toogleDevOption", devOptions);
  }, [devOptions]);

  const handleChange = () => {
    setMenuVisible(!menuVisible);
  };

  const openGameDir = (e: React.MouseEvent<HTMLLIElement>) => {
    window.api.ipc.send("openGameDir");
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  const openStatus = (e: React.MouseEvent<HTMLLIElement>) => {
    window.api.ipc.send("openUrl", "https://status.arena-returns.com/");
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  const closeApp = () => {
    window.api.ipc.send("close");
  };

  const minimizeApp = () => {
    window.api.ipc.send("minimize");
  };

  const nextDebugMode = (e: React.MouseEvent<HTMLLIElement>) => {
    const next: DebugMode = (debugMode + 1) % DebugMode.__LENGTH;
    setDebugMode(next);
    window.api.ipc.send("changeDebugMode", next);
    e.stopPropagation(); //we prevent the event from closing the whole menu
  };

  const clearLogs = () => {
    window.api.ipc.send("clearLogs");
  };

  const repairApp = () => {
    window.api.ipc.send("repair");
  };

  useEffect(() => {
    window.api.ipc.on("setRepairVisible", (_event: Event, visible: boolean) => {
      setRepairVisible(visible);
    });
    window.api.ipc.on("devModeEnabled", (_event: Event) => {
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
