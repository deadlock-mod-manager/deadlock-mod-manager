import type { WideEvent } from "../logger/wide-event";

export type AppEnv = {
  Variables: {
    requestId: string;
    wideEvent?: WideEvent;
  };
};
