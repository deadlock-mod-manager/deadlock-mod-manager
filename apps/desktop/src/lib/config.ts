const isDev = import.meta.env.DEV;

export const SERVER_URL =
  import.meta.env.VITE_API_URL ??
  (isDev ? "http://localhost:9000" : "https://api.deadlockmods.app");

export const WEB_URL =
  import.meta.env.VITE_WEB_URL ??
  (isDev ? "http://localhost:3003" : "https://deadlockmods.app");

export const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ??
  (isDev ? "http://localhost:3004" : "https://auth.deadlockmods.app");

const parseHeartbeatInterval = (): number => {
  const value = import.meta.env.HEARTBEAT_INTERVAL_SECONDS;
  if (!value) return 60;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 10 || parsed > 300) return 60;
  return parsed;
};

export const HEARTBEAT_INTERVAL_SECONDS = parseHeartbeatInterval();
