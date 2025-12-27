const isDev = import.meta.env.DEV;

export const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (isDev ? "http://localhost:9000" : "https://api.deadlockmods.app");

export const WEB_URL =
  import.meta.env.VITE_WEB_URL ??
  (isDev ? "http://localhost:3003" : "https://deadlockmods.app");

export const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ??
  (isDev ? "http://localhost:3004" : "https://auth.deadlockmods.app");
