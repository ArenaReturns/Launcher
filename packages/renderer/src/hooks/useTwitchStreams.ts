import { useState, useEffect, useRef, useCallback } from "react";
import log from "@/utils/logger";
import type { TwitchStream, TwitchApiResponse } from "@/types";

interface UseTwitchStreamsReturn {
  streams: TwitchStream[];
  isLoading: boolean;
  error: string | null;
  refreshStreams: () => Promise<void>;
}

export const useTwitchStreams = (): UseTwitchStreamsReturn => {
  const [streams, setStreams] = useState<TwitchStream[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStreams = async (): Promise<void> => {
    try {
      setError(null);
      const response = await fetch(
        "https://launcher.api.arenareturns.com/twitch/streams"
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: TwitchApiResponse = await response.json();

      // Sort streams by viewer count (highest first)
      const sortedStreams = data.streams.sort(
        (a, b) => b.viewer_count - a.viewer_count
      );
      setStreams(sortedStreams);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      log.error("Failed to fetch Twitch streams:", err);
      setError(errorMessage);
    }
  };

  const refreshStreams = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetchStreams();
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshStreams();
  }, [refreshStreams]);

  // Auto-refresh every minute
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up auto-refresh every 60 seconds
    intervalRef.current = setInterval(() => {
      // Silently refresh without loading indicator
      fetchStreams();
    }, 60000);

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    streams,
    isLoading,
    error,
    refreshStreams,
  };
};
