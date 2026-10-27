import { Button } from "@deadlock-mods/ui/components/button";
import { Toaster, toast } from "@deadlock-mods/ui/components/sonner";
import { TooltipProvider } from "@deadlock-mods/ui/components/tooltip";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThemeProvider } from "@/components/providers/theme";
import { ThemeOverridesProvider } from "@/components/providers/theme-overrides";
import {
  emptyWorkspace,
  readWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from "@/lib/modding-workspace";
import type { ModdingComparisonWindow } from "@/types/generated/ModdingComparisonWindow";
import type { ModdingSdkStatus } from "@/types/generated/ModdingSdkStatus";
import { AddonWorkspace } from "./addon-workspace";

function ComparisonContent({ initial }: { initial: WorkspaceSnapshot }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState(initial);
  const [busy, setBusy] = useState(false);
  const current = useRef({ snapshot, busy });
  current.current = { snapshot, busy };
  const allowClose = useRef(false);
  const sdk = useQuery({
    queryKey: ["modding-sdk"],
    queryFn: () => invoke<ModdingSdkStatus>("inspect_modding_sdk"),
    retry: false,
  });
  const sync = useMutation({
    scope: { id: "comparison-state" },
    mutationFn: (state: { snapshot: WorkspaceSnapshot; busy: boolean }) =>
      invoke("update_modding_comparison_window", {
        snapshot: JSON.stringify(state.snapshot),
        dirty: state.busy,
      }),
  });
  const save = sync.mutate;
  useEffect(() => {
    save({ snapshot, busy });
  }, [snapshot, busy, save]);
  const close = useMutation({
    mutationFn: async () => {
      if (current.current.busy) {
        toast.error(t("workbenchCompare.finishEditing"));
        return;
      }
      await sync.mutateAsync(current.current);
      allowClose.current = true;
      await getCurrentWindow().close();
    },
  });
  const closeRef = useRef(close.mutate);
  closeRef.current = close.mutate;
  useEffect(() => {
    const subscription = getCurrentWindow().onCloseRequested((event) => {
      if (allowClose.current) return;
      event.preventDefault();
      closeRef.current();
    });
    return () => {
      void subscription.then((unlisten) => unlisten());
    };
  }, []);
  const update = useCallback(
    (value: WorkspaceSnapshot) => setSnapshot(value),
    [],
  );
  return (
    <main className='flex h-screen min-h-0 flex-col gap-3 bg-background p-3 text-foreground'>
      <header className='flex shrink-0 items-center justify-between gap-3'>
        <h1 className='text-sm font-semibold'>{t("workbenchCompare.title")}</h1>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || close.isPending}
          onClick={() => close.mutate()}>
          {t("workbenchCompare.dock")}
        </Button>
      </header>
      <AddonWorkspace
        comparison
        addonsEnabled={!!sdk.data?.compatible}
        initialSnapshot={initial}
        onSnapshotChange={update}
        onDirtyChange={setBusy}
      />
    </main>
  );
}

export function ComparisonWindow() {
  const { t } = useTranslation();
  const state = useQuery({
    queryKey: ["comparison-window-initial"],
    queryFn: () =>
      invoke<ModdingComparisonWindow>("get_modding_comparison_window"),
    staleTime: Infinity,
  });
  return (
    <ThemeProvider storageKey='deadlock-theme-v2'>
      <ThemeOverridesProvider>
        <TooltipProvider>
          {state.data ? (
            <ComparisonContent
              initial={
                state.data.snapshot
                  ? readWorkspaceSnapshot(state.data.snapshot)
                  : emptyWorkspace()
              }
            />
          ) : (
            <p role='status' className='p-4'>
              {state.error?.message ?? t("common.loading")}
            </p>
          )}
          <Toaster />
        </TooltipProvider>
      </ThemeOverridesProvider>
    </ThemeProvider>
  );
}
