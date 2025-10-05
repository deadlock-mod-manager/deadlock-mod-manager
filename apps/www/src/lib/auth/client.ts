import { createAuthClient } from "better-auth/react";
import { steamClient } from "./plugins/steam";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL || "http://localhost:9000",
  plugins: [steamClient()],
});
