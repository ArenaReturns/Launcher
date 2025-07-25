import { app } from "electron";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import log from "electron-log";
import { GameSettings } from "../modules/GameUpdater.js";

type SettingsChangeCallback = (settings: GameSettings) => void;

export class SettingsManager {
  private settingsPath: string;
  private currentSettings: GameSettings;
  private changeCallbacks: Set<SettingsChangeCallback> = new Set();

  constructor() {
    this.settingsPath = join(app.getPath("userData"), "settings.json");
    this.currentSettings = this.getDefaultSettings();
  }

  private getDefaultSettings(): GameSettings {
    return {
      gameRamAllocation: 2,
      devModeEnabled: false,
      devExtraJavaArgs: "",
      devForceVersion: "",
      devCdnEnvironment: "production",
    };
  }

  /**
   * Load settings from disk. Must be called before any modules are initialized.
   */
  async loadSettings(): Promise<GameSettings> {
    try {
      if (!existsSync(this.settingsPath)) {
        log.info("Settings file not found, using defaults");
        return this.currentSettings;
      }

      const data = await readFile(this.settingsPath, "utf-8");
      const settings = JSON.parse(data) as Partial<GameSettings>;

      // Merge with defaults to ensure all properties exist
      this.currentSettings = { ...this.getDefaultSettings(), ...settings };

      log.info("Settings loaded successfully:", this.currentSettings);
      return this.currentSettings;
    } catch (error) {
      log.error("Failed to load settings, using defaults:", error);
      this.currentSettings = this.getDefaultSettings();
      return this.currentSettings;
    }
  }

  /**
   * Save settings to disk and notify all modules of the change
   */
  async saveSettings(settings: GameSettings): Promise<void> {
    try {
      // Ensure the directory exists
      const settingsDir = join(app.getPath("userData"));
      if (!existsSync(settingsDir)) {
        mkdirSync(settingsDir, { recursive: true });
      }

      await writeFile(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        "utf-8"
      );

      log.info("Settings saved successfully:", settings);

      // Update current settings
      this.currentSettings = { ...settings };

      // Notify all modules of the change
      this.notifySettingsChange(this.currentSettings);
    } catch (error) {
      log.error("Failed to save settings:", error);
      throw new Error(
        `Failed to save settings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Update settings without saving to disk (for temporary changes)
   */
  updateSettings(settings: GameSettings): void {
    log.info("Settings updated:", settings);
    this.currentSettings = { ...settings };
    this.notifySettingsChange(this.currentSettings);
  }

  /**
   * Get current settings
   */
  getCurrentSettings(): GameSettings {
    return { ...this.currentSettings };
  }

  /**
   * Register a callback to be notified when settings change
   */
  onSettingsChange(callback: SettingsChangeCallback): () => void {
    this.changeCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.changeCallbacks.delete(callback);
    };
  }

  /**
   * Notify all registered modules about settings changes
   */
  private notifySettingsChange(settings: GameSettings): void {
    log.info(
      `Notifying ${this.changeCallbacks.size} modules of settings change`
    );

    for (const callback of this.changeCallbacks) {
      try {
        callback(settings);
      } catch (error) {
        log.error("Error in settings change callback:", error);
      }
    }
  }

  /**
   * Clear all change callbacks (useful for cleanup)
   */
  clearCallbacks(): void {
    this.changeCallbacks.clear();
  }
}

// Singleton instance
let settingsManagerInstance: SettingsManager | null = null;

export function getSettingsManager(): SettingsManager {
  if (!settingsManagerInstance) {
    settingsManagerInstance = new SettingsManager();
  }
  return settingsManagerInstance;
}

export function createSettingsManager(): SettingsManager {
  return new SettingsManager();
}
