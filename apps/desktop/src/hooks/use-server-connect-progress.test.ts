import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as React from "react";

type ProgressEvent = {
  payload: {
    status:
      | "retrying"
      | "waiting-for-game"
      | "waiting-for-client"
      | "monitoring-stopped"
      | "timed-out";
    address: string;
    attempt: number;
  };
};

let dispatch = (_event: ProgressEvent) => {};
const toast = {
  loading: mock(() => {}),
  dismiss: mock(() => {}),
  warning: mock(() => {}),
  success: mock(() => {}),
};
mock.module("@deadlock-mods/ui/components/sonner", () => ({ toast }));
mock.module("@tauri-apps/api/event", () => ({
  listen: async (_event: string, listener: typeof dispatch) => {
    dispatch = listener;
    return () => {};
  },
}));
mock.module("react", () => ({
  ...React,
  useEffect: (effect: () => void | (() => void)) => {
    effect();
  },
}));
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { useServerConnectProgress } =
  await import("./use-server-connect-progress");
const send = (status: ProgressEvent["payload"]["status"]) =>
  dispatch({
    payload: { status, address: "203.0.113.10:27015", attempt: 1 },
  });

describe("server connect progress", () => {
  beforeEach(() => {
    for (const fn of Object.values(toast)) fn.mockClear();
    useServerConnectProgress();
  });

  it("clears a previous retry toast when a new watch starts or monitoring stops", () => {
    for (const status of [
      "waiting-for-game",
      "waiting-for-client",
      "monitoring-stopped",
    ] as const) {
      send("retrying");
      send(status);
      expect(toast.dismiss).toHaveBeenLastCalledWith("server-connect-progress");
    }
    expect(toast.loading).toHaveBeenCalledTimes(3);
    expect(toast.dismiss).toHaveBeenCalledTimes(3);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("replaces retry progress with the manual-connect warning on failure", () => {
    send("retrying");
    send("timed-out");
    expect(toast.warning).toHaveBeenCalledWith("servers.connect.timedOut", {
      id: "server-connect-progress",
      duration: 15_000,
    });
  });
});
