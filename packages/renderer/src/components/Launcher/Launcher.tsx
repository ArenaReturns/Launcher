import { useKonami } from "react-konami-code";
import Loader from "../Loader";
import LogoAndSocial from "../LogoAndSocial";
import NewsCarousel from "../NewsCarousel";
import TitleBar from "../TitleBar";
import styles from "./Launcher.module.scss";
import { Oval } from "react-loader-spinner";
import { useState, useEffect } from "react";

const enableDevMode = () => {
  window.api.ipc.send("enableDevMode");
};

const toggleDevTools = () => {
  window.api.ipc.send("toggleDevTools");
};

export const Launcher = () => {
  const [launcherReady, setLauncherReady] = useState(false);

  useEffect(() => {
    window.api.ipc.on("setLauncherReady", (_event: Event, ready: boolean) => {
      setLauncherReady(ready);
    });

    window.api.ipc.invoke("getLauncherReady").then((ready: boolean) => {
      setLauncherReady(ready);
    });
  }, []);

  useKonami(enableDevMode, {
    code: [68, 69, 86, 77, 79, 68, 69],
  });

  useKonami(toggleDevTools, {
    code: [123],
  });

  return (
    <div className={styles.Launcher}>
      <TitleBar />
      {!launcherReady && (
        <div className={styles.loader}>
          <Oval
            height={"15em"}
            width={"15em"}
            color="#D8C217"
            wrapperStyle={{}}
            wrapperClass=""
            visible={true}
            ariaLabel="oval-loading"
            secondaryColor="#D8C217"
            strokeWidth={2}
            strokeWidthSecondary={2}
          />
          <div className={styles.loaderText}>Chargement de l'Hormonde...</div>
        </div>
      )}
      {launcherReady && (
        <div className={styles.container}>
          <div className={styles.topPart}>
            <NewsCarousel />
            <LogoAndSocial />
          </div>
          <div className={styles.bottomPart}>
            <Loader />
          </div>
        </div>
      )}
    </div>
  );
};
