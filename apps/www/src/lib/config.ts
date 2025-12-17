/**
 * Server URL from environment variables.
 */
export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "http://localhost:9000";
export const AUTH_URL =
  import.meta.env.VITE_AUTH_URL || "http://localhost:3004";
