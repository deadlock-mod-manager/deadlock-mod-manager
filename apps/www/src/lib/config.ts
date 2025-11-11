/**
 * Server URL from environment variables.
 * Falls back to https://api.deadlockmods.app if not set.
 */
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "https://api.deadlockmods.app";
