import React, { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useGameState } from "@/hooks/useGameState";
import type { GameState, GameStateActions } from "@/hooks/useGameState";

interface GameStateContextType {
  gameState: GameState;
  gameActions: GameStateActions;
}

const GameStateContext = createContext<GameStateContextType | undefined>(
  undefined
);

interface GameStateProviderProps {
  children: ReactNode;
}

export const GameStateProvider: React.FC<GameStateProviderProps> = ({
  children,
}) => {
  const [gameState, gameActions] = useGameState();

  const value: GameStateContextType = {
    gameState,
    gameActions,
  };

  return (
    <GameStateContext.Provider value={value}>
      {children}
    </GameStateContext.Provider>
  );
};

export const useGameStateContext = (): GameStateContextType => {
  const context = useContext(GameStateContext);
  if (context === undefined) {
    throw new Error(
      "useGameStateContext must be used within a GameStateProvider"
    );
  }
  return context;
};

// Convenience hooks for specific parts of the state
export const useGameReady = () => {
  const { gameState } = useGameStateContext();
  return gameState.isReady;
};

export const useCanLaunch = () => {
  const { gameState } = useGameStateContext();
  return gameState.canLaunch;
};

export const useGameStatus = () => {
  const { gameState } = useGameStateContext();
  return {
    isInstalled: gameState.isInstalled,
    needsUpdate: gameState.needsUpdate,
    localVersion: gameState.localVersion,
    remoteVersion: gameState.remoteVersion,
    statusText: gameState.statusText,
    error: gameState.error,
  };
};

export const useDownloadState = () => {
  const { gameState } = useGameStateContext();
  return {
    isDownloading: gameState.isDownloading,
    isRepairing: gameState.isRepairing,
    progress: gameState.downloadProgress,
    canStart: gameState.canStartDownload,
  };
};
