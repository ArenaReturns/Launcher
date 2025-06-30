import React, { useState } from "react";
import { Preloader } from "./components/Preloader";
import { MainLauncher } from "./components/MainLauncher";
import "./App.css";

interface AppData {
  gameStatus: GameStatus;
  updateStatus: UpdateStatus;
}

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [appData, setAppData] = useState<AppData | null>(null);

  const handlePreloaderComplete = (data: AppData) => {
    setAppData(data);
    setIsLoading(false);
  };

  if (isLoading) {
    return <Preloader onComplete={handlePreloaderComplete} />;
  }

  return (
    <MainLauncher
      gameStatus={appData?.gameStatus}
      updateStatus={appData?.updateStatus}
    />
  );
};

export default App;
