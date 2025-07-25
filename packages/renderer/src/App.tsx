import React, { useState } from "react";
import { Preloader } from "./components/Preloader";
import { MainLauncher } from "./components/MainLauncher";
import { GameStateProvider } from "./contexts/GameStateContext";
import type { SettingsState } from "./types";
import "./App.css";

interface LauncherData {
  updateStatus?: UpdateStatus;
  settings: SettingsState;
}

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [launcherData, setLauncherData] = useState<LauncherData | null>(null);

  const handlePreloaderComplete = (data: {
    updateStatus: UpdateStatus;
    settings: SettingsState;
  }) => {
    setLauncherData(data);
    setIsLoading(false);
  };

  if (isLoading) {
    return <Preloader onComplete={handlePreloaderComplete} />;
  }

  return (
    <GameStateProvider>
      <MainLauncher
        updateStatus={launcherData?.updateStatus}
        initialSettings={launcherData!.settings}
      />
    </GameStateProvider>
  );
};

export default App;
