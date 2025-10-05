import type { BetterAuthClientPlugin } from "better-auth";
import type { steam } from "../../../../../api/src/lib/auth/plugins/steam";

export const steamClient = () => {
  return {
    id: "steam-client",
    $InferServerPlugin: {} as ReturnType<typeof steam>,
    pathMethods: {
      "/sign-in/steam": "POST",
    },
  } satisfies BetterAuthClientPlugin;
};
