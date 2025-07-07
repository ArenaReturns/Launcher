// Allowed external domains that can be opened by the application
export const ALLOWED_EXTERNAL_ORIGINS = new Set([
  "https://developer.mozilla.org",
  "https://arenareturns.com",
  "https://www.arenareturns.com",
  "https://strapi.arenareturns.com",
  "https://launcher.cdn.arenareturns.com",
  "https://launcher.api.arenareturns.com",
  "https://discord.gg",
  "https://twitch.tv",
]);

/**
 * Validates if a URL is allowed to be opened externally
 * @param url The URL to validate
 * @returns true if the URL is allowed, false otherwise
 */
export function isUrlAllowed(url: string): boolean {
  try {
    // Only allow HTTPS URLs
    if (!url.startsWith("https://")) {
      return false;
    }

    const urlObj = new URL(url);
    return ALLOWED_EXTERNAL_ORIGINS.has(urlObj.origin);
  } catch {
    // Invalid URL
    return false;
  }
}
