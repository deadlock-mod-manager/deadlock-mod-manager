import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "../../../../api/src/lib/auth";
import { SERVER_URL } from "../config";
import { steamClient } from "./plugins/steam";

export const authClient = createAuthClient({
  baseURL: SERVER_URL,
  fetchOptions: {
    credentials: "include",
  },
  plugins: [steamClient(), inferAdditionalFields<typeof auth>()],
});
