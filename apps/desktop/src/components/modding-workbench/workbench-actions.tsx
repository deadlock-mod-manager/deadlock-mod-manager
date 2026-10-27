import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { t as translate } from "i18next";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStartGame } from "@/components/providers/launch-repair";
import { getErrorMessage } from "@/lib/errors";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingBuildResult } from "@/types/generated/ModdingBuildResult";
import { packAndTest, type Phase } from "./pack-and-test";

type Request = { id: string; addonId: string };
type Response = { id: string } & (
  | { kind: "phase"; phase: Phase }
  | { kind: "result"; build: ModdingBuildResult }
  | { kind: "error"; message: string }
);
const REQUEST = "workbench-pack-test-request";
const RESPONSE = "workbench-pack-test-response";

export async function requestPackAndTest(
  addonId: string,
  onPhase: (phase: Phase) => void,
): Promise<ModdingBuildResult> {
  const id = crypto.randomUUID();
  let dispose: UnlistenFn | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<ModdingBuildResult>((resolve, reject) => {
      void listen<Response>(RESPONSE, ({ payload }) => {
        if (payload.id !== id) return;
        clearTimeout(timer);
        if (payload.kind === "phase") onPhase(payload.phase);
        else if (payload.kind === "result") resolve(payload.build);
        else reject(new Error(payload.message));
      })
        .then(async (unlisten) => {
          dispose = unlisten;
          timer = setTimeout(
            () =>
              reject(new Error(translate("workbenchCompare.mainUnavailable"))),
            10_000,
          );
          await emitTo("main", REQUEST, { id, addonId });
        })
        .catch(reject);
    });
  } finally {
    clearTimeout(timer);
    dispose?.();
  }
}

export function WorkbenchActionBridge() {
  const { t } = useTranslation();
  const startGame = useStartGame();
  const active = useRef(false);
  const mutation = useMutation({
    mutationKey: ["workbench-build"],
    mutationFn: async (request: Request) => {
      const reply = (response: Response) =>
        emitTo("workbench-compare", RESPONSE, response);
      if (active.current) {
        await reply({
          id: request.id,
          kind: "error",
          message: t("workbenchCompare.buildBusy"),
        });
        return;
      }
      active.current = true;
      try {
        await reply({ id: request.id, kind: "phase", phase: "compiling" });
        const addons = await invoke<ModdingAddon[]>("list_modding_addons");
        const addon = addons.find(
          (candidate) => candidate.id === request.addonId,
        );
        if (!addon) throw new Error(t("workbenchExplorer.noAddons"));
        await getCurrentWindow().show();
        const build = await packAndTest(
          addon,
          startGame,
          (phase) => {
            void reply({ id: request.id, kind: "phase", phase });
          },
          () => {},
          t,
        );
        await reply({ id: request.id, kind: "result", build });
      } catch (error) {
        await reply({
          id: request.id,
          kind: "error",
          message: getErrorMessage(error),
        });
      } finally {
        active.current = false;
      }
    },
  });
  const run = useRef(mutation.mutate);
  run.current = mutation.mutate;
  useEffect(() => {
    const subscription = listen<Request>(REQUEST, ({ payload }) =>
      run.current(payload),
    );
    return () => {
      void subscription.then((unlisten) => unlisten());
    };
  }, []);
  return null;
}
