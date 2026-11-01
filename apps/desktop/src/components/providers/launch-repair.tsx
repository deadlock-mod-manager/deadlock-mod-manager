import { ValidationError } from "@deadlock-mods/common/client-errors";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowsClockwiseIcon, PowerIcon } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { LaunchRepairDetails } from "@/components/launch-repair-details";
import { useReinstallMod } from "@/hooks/use-reinstall-mod";
import { getErrorMessage } from "@/lib/errors";
import { withWritableRecovery } from "@/lib/file-permissions";
import { invokeGuarded } from "@/lib/game-guard";
import {
  type LaunchRepairFailure,
  type LaunchRepairMod,
  type LaunchRepairProgress,
  launchRepairTargets,
  repairLaunchFiles,
  resolveLaunchRepairMods,
} from "@/lib/launch-repair";
import { usePersistedStore } from "@/lib/store";
import { getProfileVpkSnapshot } from "@/lib/tauri-commands";
import { ModStatus } from "@/types/mods";
import { type ErrorKind, isTauriError } from "@/types/tauri";

type LaunchArgs = {
  vanilla: boolean;
  additionalArgs: string;
  profileFolder: string | null;
};
type RepairRequest = {
  args: LaunchArgs;
  profileId: string;
  mods: LaunchRepairMod[];
  resolve: (launched: boolean) => void;
  reject: (error: ErrorKind) => void;
};

const LaunchRepairContext = createContext<
  (args: LaunchArgs) => Promise<boolean>
>(async () => false);

export function LaunchRepairProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { reinstallMod } = useReinstallMod();
  const [request, setRequest] = useState<RepairRequest | null>(null);
  const [failures, setFailures] = useState<LaunchRepairFailure[] | null>(null);
  const [progress, setProgress] = useState<LaunchRepairProgress | null>(null);
  const activeRequest = useRef(false);
  const working = useRef(false);

  const close = () => {
    setRequest(null);
    activeRequest.current = false;
  };
  const finish = (launched: boolean) => {
    request?.resolve(launched);
    close();
  };

  const repair = useMutation({
    mutationFn: async (action: "reinstall" | "disable") => {
      if (!request || working.current) return;
      working.current = true;
      setProgress(null);
      const checkProfile = () => {
        if (
          usePersistedStore.getState().activeProfileId !== request.profileId
        ) {
          throw new ValidationError(t("launchRepair.profileChanged"));
        }
      };
      // The relaunch can still stop for compatibility review, which the caller
      // handles by retrying the whole launch.
      let reviewRequired: ErrorKind | undefined;
      try {
        checkProfile();
        const targets = launchRepairTargets(request.mods, failures);
        const failed = await repairLaunchFiles(targets, action, {
          reinstall: async (mod) => {
            checkProfile();
            return reinstallMod(mod);
          },
          disable: async (target) => {
            checkProfile();
            const store = usePersistedStore.getState();
            const mod = store.localMods.find(
              (item) => item.remoteId === target.id,
            );
            const { manifest } = await getProfileVpkSnapshot(
              request.args.profileFolder,
            );
            if (manifest.mods[target.id]?.enabled) {
              await invokeGuarded("uninstall_mod", {
                modId: target.id,
                vpks: mod?.installedVpks ?? [],
                profileFolder: request.args.profileFolder,
              });
            }
            if (mod?.status === ModStatus.Installed) {
              store.setModStatus(target.id, ModStatus.Downloaded);
            }
            store.setModEnabledInCurrentProfile(target.id, false);
          },
          launch: async () => {
            checkProfile();
            setFailures([]);
            try {
              await withWritableRecovery(() =>
                invoke("start_game", request.args),
              );
            } catch (error) {
              if (
                isTauriError(error) &&
                error.kind === "missingEnabledModFiles" &&
                error.affectedMods?.length
              ) {
                setFailures(error.affectedMods.map(({ id }) => ({ id })));
              }
              if (
                !isTauriError(error) ||
                error.kind !== "modDataReviewRequired"
              ) {
                throw error;
              }
              reviewRequired = error;
            }
          },
          onProgress: setProgress,
        });
        setFailures(failed);
        if (reviewRequired) {
          close();
          request.reject(reviewRequired);
        } else if (failed.length === 0) {
          finish(true);
        }
      } finally {
        working.current = false;
        setProgress(null);
      }
    },
    meta: { skipGlobalErrorHandler: true },
  });

  const { reset: resetRepair } = repair;
  const startGame = useCallback(
    async (args: LaunchArgs) => {
      if (activeRequest.current) return false;
      activeRequest.current = true;
      const snapshot = usePersistedStore.getState();
      try {
        await withWritableRecovery(() => invoke("start_game", args));
        activeRequest.current = false;
        return true;
      } catch (error) {
        if (
          !args.vanilla &&
          isTauriError(error) &&
          error.kind === "missingEnabledModFiles" &&
          error.affectedMods?.length
        ) {
          const mods = resolveLaunchRepairMods(
            error.affectedMods,
            snapshot.localMods,
          );
          resetRepair();
          setFailures(null);
          setProgress(null);
          return new Promise<boolean>((resolve, reject) => {
            setRequest({
              args,
              profileId: snapshot.activeProfileId,
              mods,
              resolve,
              reject,
            });
          });
        }
        activeRequest.current = false;
        throw error;
      }
    },
    [resetRepair],
  );

  return (
    <LaunchRepairContext.Provider value={startGame}>
      {children}
      <AlertDialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open && !repair.isPending && !working.current) finish(false);
        }}>
        <AlertDialogContent
          className='gap-0 overflow-hidden p-0 sm:max-w-xl'
          data-testid='launch-repair-dialog'
          onEscapeKeyDown={(event) => {
            if (repair.isPending || working.current) event.preventDefault();
          }}>
          <AlertDialogHeader className='space-y-1.5 p-6 text-left'>
            <AlertDialogTitle className='text-base leading-6'>
              {t("launchRepair.title", { count: request?.mods.length ?? 0 })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("launchRepair.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <LaunchRepairDetails
            mods={request?.mods ?? []}
            failures={failures ?? []}
            progress={progress}
          />
          {repair.isError && (
            <p className='px-6 pb-4 text-sm text-destructive' role='alert'>
              {getErrorMessage(repair.error)}
            </p>
          )}
          <AlertDialogFooter className='gap-2 border-t bg-muted/30 px-6 py-3 sm:space-x-0'>
            <Button
              data-testid='launch-repair-cancel'
              disabled={repair.isPending}
              onClick={() => finish(false)}
              variant='ghost'>
              {t("common.cancel")}
            </Button>
            <Button
              data-testid='launch-repair-disable'
              disabled={repair.isPending}
              icon={<PowerIcon className='h-4 w-4' />}
              onClick={() => repair.mutate("disable")}
              variant='outline'>
              {t("launchRepair.disableAndLaunch")}
            </Button>
            <Button
              data-testid='launch-repair-reinstall'
              disabled={
                repair.isPending || !!failures?.length || repair.isError
              }
              icon={<ArrowsClockwiseIcon className='h-4 w-4' />}
              onClick={() => repair.mutate("reinstall")}>
              {t("launchRepair.reinstallAndLaunch")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LaunchRepairContext.Provider>
  );
}

export const useStartGame = () => useContext(LaunchRepairContext);
