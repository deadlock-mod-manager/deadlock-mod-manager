import type { WideEvent } from "@deadlock-mods/logging";

export type AppEnv = {
  Variables: {
    requestId: string;
    wideEvent: WideEvent;
  };
};
