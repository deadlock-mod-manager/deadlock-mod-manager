import { env } from "../../env";

const isDev = env.NODE_ENV === "development";

export const SERVER_URL =
  process.env.VITE_SERVER_URL ??
  (isDev ? "http://localhost:9000" : "https://api.deadlockmods.app");

export const AUTH_URL =
  process.env.VITE_AUTH_URL ??
  (isDev ? "http://localhost:3004" : "https://auth.deadlockmods.app");

export const WEB_URL =
  process.env.VITE_WEB_URL ??
  (isDev ? "http://localhost:3003" : "https://deadlockmods.app");
