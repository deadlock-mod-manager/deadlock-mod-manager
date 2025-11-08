import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "../../../../api/src/lib/auth";
import { steamClient } from "./plugins/steam";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SERVER_URL || "http://localhost:9000",
  fetchOptions: {
    credentials: "include",
  },
  plugins: [steamClient(), inferAdditionalFields<typeof auth>()],
});
