import { useState } from "react";
import type { DownloadState } from "@/types";

export const useDownload = () => {
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("0 MB/s");
  const [timeRemaining, setTimeRemaining] = useState("--:--");

  const startDownload = () => {
    setDownloadState("downloading");
    setDownloadProgress(0);

    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        const newProgress = prev + Math.random() * 3 + 1;

        const speed = (Math.random() * 50 + 10).toFixed(1);
        setDownloadSpeed(`${speed} MB/s`);

        const remaining = Math.max(0, (100 - newProgress) * 2);
        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60);
        setTimeRemaining(
          `${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}`
        );

        if (newProgress >= 100) {
          clearInterval(interval);
          setDownloadState("completed");
          setTimeRemaining("00:00");
          return 100;
        }

        return newProgress;
      });
    }, 200);
  };

  const pauseDownload = () => {
    setDownloadState("paused");
  };

  const resumeDownload = () => {
    setDownloadState("downloading");
  };

  const retryDownload = () => {
    startDownload();
  };

  return {
    downloadState,
    downloadProgress,
    downloadSpeed,
    timeRemaining,
    startDownload,
    pauseDownload,
    resumeDownload,
    retryDownload,
  };
};
