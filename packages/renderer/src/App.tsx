import React, { useState } from "react";
import { Preloader } from "./components/Preloader";
import { MainLauncher } from "./components/MainLauncher";
import { GameStateProvider } from "./contexts/GameStateContext";
import "./App.css";

interface LauncherData {
  updateStatus: UpdateStatus;
}

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [launcherData, setLauncherData] = useState<LauncherData | null>(null);

  const handlePreloaderComplete = (data: LauncherData) => {
    setLauncherData(data);
    setIsLoading(false);
  };

  if (isLoading) {
    return <Preloader onComplete={handlePreloaderComplete} />;
  }

  return (
    <GameStateProvider>
      <MainLauncher updateStatus={launcherData?.updateStatus} />
    </GameStateProvider>
  );
};

export default App;
