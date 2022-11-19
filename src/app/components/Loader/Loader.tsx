import MainButton from "../MainButton";
import Progress from "../Progress";
import styles from "./Loader.module.scss";
import cx from "classnames";

import { useEffect, useMemo, useState } from "react";

enum LoaderState {
  INITIALIZING,
  CHECKING,
  UPDATE_REQUIRED,
  DOWNLOADING,
  UP_TO_DATE,
}

export const Loader = () => {
  const [loaderState, setLoaderState] = useState<LoaderState>(LoaderState.INITIALIZING);
  const [itemsLoaded, setItemsLoaded] = useState(0);
  const [itemsTotal, setItemsTotal] = useState(0);

  const progress = useMemo(() => Math.round((itemsLoaded * 100) / itemsTotal) || 0, [itemsLoaded, itemsTotal]);

  const mainBtnProps = useMemo(() => {
    switch (loaderState) {
      case LoaderState.INITIALIZING:
      case LoaderState.UP_TO_DATE:
        return { label: "Jouer", className: styles.bigText };
      default:
        return { label: "Mettre à jour" };
    }
  }, [loaderState]);

  const mainBtnDisabled = useMemo(() => {
    return loaderState !== LoaderState.UP_TO_DATE && loaderState !== LoaderState.UPDATE_REQUIRED;
  }, [loaderState]);

  const progressLabel = useMemo(() => {
    switch (loaderState) {
      case LoaderState.INITIALIZING:
        return "Vérification des mises à jour...";
      case LoaderState.CHECKING:
        return "Vérification des fichiers du client...";
      case LoaderState.UPDATE_REQUIRED:
        return "Mise à jour requise pour jouer";
      case LoaderState.DOWNLOADING:
        return `Mise à jour du client... [${itemsLoaded}/${itemsTotal}]`;
      case LoaderState.UP_TO_DATE:
        return "Vous êtes à jour, bon jeu !";
    }
  }, [loaderState, itemsLoaded, itemsTotal]);

  function mainBtnClick() {
    if (loaderState === LoaderState.UP_TO_DATE) launchGame();
    else if (loaderState === LoaderState.UPDATE_REQUIRED) startUpdating();
  }

  function startUpdating() {
    setLoaderState(LoaderState.CHECKING);
    window.api.ipc.send("startUpdate");
  }

  function launchGame() {
    window.api.ipc.send("launchGame");
  }

  useEffect(() => {
    window.api.ipc.invoke("isUpdateNeeded").then((updateNeeded: boolean) => {
      if (updateNeeded) {
        setLoaderState(LoaderState.UPDATE_REQUIRED);
      } else {
        setLoaderState(LoaderState.UP_TO_DATE);
        // Fill progressbar
        setItemsLoaded(1);
        setItemsTotal(1);
      }
    });

    // Getting the new state from the main process
    window.api.ipc.on("itemsLoadedUpdate", (_event, itemsLoaded: number) => {
      setItemsLoaded(itemsLoaded);
    });

    window.api.ipc.on("itemsTotalUpdate", (_event, itemsTotal: number) => {
      setItemsTotal(itemsTotal);
    });

    window.api.ipc.on("repairStarted", (_event) => {
      startUpdating();
    });

    window.api.ipc.on("downloadStarted", (_event, itemsTotal: number) => {
      setLoaderState(LoaderState.DOWNLOADING);
      setItemsLoaded(0);
      setItemsTotal(itemsTotal);
    });

    window.api.ipc.on("upToDate", (_event) => {
      setLoaderState(LoaderState.UP_TO_DATE);
      // Fill progressbar
      setItemsLoaded(1);
      setItemsTotal(1);
    });
  }, []);

  return (
    <>
      <Progress label={progressLabel} progress={progress} hideProgress={loaderState === LoaderState.INITIALIZING} />
      <MainButton
        label={mainBtnProps.label}
        disabled={mainBtnDisabled}
        btnClassName={cx(styles.mainBtn, mainBtnProps.className)}
        onClick={mainBtnClick}
      />
    </>
  );
};
