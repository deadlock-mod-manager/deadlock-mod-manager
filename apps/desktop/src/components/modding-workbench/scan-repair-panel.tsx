import { Button } from "@deadlock-mods/ui/components/button";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingRepairBackup } from "@/types/generated/ModdingRepairBackup";
import type { ModdingRepairResult } from "@/types/generated/ModdingRepairResult";
import type { ModdingRepairScan } from "@/types/generated/ModdingRepairScan";
import { RepairBackups } from "./repair-backups";
import { RepairIssueRow } from "./repair-issue-row";

interface Props {
  addon: ModdingAddon;
  onChanged: () => void;
  onClose: () => void;
}

export function ScanRepairPanel({ addon, onChanged, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<"repairs" | "review">("repairs");
  const [needsScan, setNeedsScan] = useState(false);
  const scan = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: () =>
      invoke<ModdingRepairScan>("scan_modding_addon", { addonId: addon.id }),
    onMutate: () => {
      setSelected(new Set());
      setNeedsScan(true);
    },
    onSuccess: () => setNeedsScan(false),
    meta: { skipGlobalErrorHandler: true },
  });
  const backups = useQuery({
    queryKey: ["workbench-repair-backups", addon.id],
    queryFn: () =>
      invoke<ModdingRepairBackup[]>("list_modding_repair_backups", {
        addonId: addon.id,
      }),
  });
  const changed = async () => {
    onChanged();
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["workbench-repair-backups", addon.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["workbench-files", addon.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["workbench-image-inputs", addon.id],
      }),
    ]);
    scan.mutate();
  };
  const apply = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: () =>
      invoke<ModdingRepairResult>("apply_modding_repairs", {
        addonId: addon.id,
        fingerprint: scan.data?.fingerprint,
        repairIds: [...selected],
      }),
    onMutate: () => {
      setNeedsScan(true);
      compile.reset();
      restore.reset();
    },
    onSuccess: changed,
    onError: () =>
      void queryClient.invalidateQueries({
        queryKey: ["workbench-repair-backups", addon.id],
      }),
    meta: { skipGlobalErrorHandler: true },
  });
  const restore = useMutation({
    mutationKey: ["workbench-files-change", addon.id],
    mutationFn: (backupId: string) =>
      invoke<void>("restore_modding_repairs", { addonId: addon.id, backupId }),
    onMutate: () => {
      setNeedsScan(true);
      compile.reset();
      apply.reset();
    },
    onSuccess: changed,
    meta: { skipGlobalErrorHandler: true },
  });
  const compile = useMutation({
    mutationKey: ["workbench-build"],
    mutationFn: () =>
      invoke<string>("compile_modding_addon", {
        addonId: addon.id,
        paths: null,
      }),
    onSuccess: changed,
    meta: { skipGlobalErrorHandler: true },
  });
  const changing =
    useIsMutating({ mutationKey: ["workbench-files-change", addon.id] }) > 0;
  const building = useIsMutating({ mutationKey: ["workbench-build"] }) > 0;
  const busy = changing || building;
  const issues = scan.data?.issues ?? [];
  const repairs = issues.filter((issue) => issue.repairable);
  const review = issues.filter((issue) => !issue.repairable);
  const visible = view === "repairs" ? repairs : review;
  const error =
    scan.error ??
    apply.error ??
    restore.error ??
    compile.error ??
    backups.error;
  const rescan = () => {
    apply.reset();
    restore.reset();
    compile.reset();
    scan.mutate();
  };

  return (
    <section
      className='flex min-h-0 flex-1 flex-col'
      aria-label={t("workbenchRepair.title")}>
      <div className='flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3'>
        <div className='max-w-prose space-y-1'>
          <h3 className='text-base font-semibold'>
            {t("workbenchRepair.title")}
          </h3>
          <p className='text-xs text-muted-foreground'>
            {t("workbenchRepair.description")}
          </p>
        </div>
        <Button size='sm' variant='ghost' disabled={busy} onClick={onClose}>
          {t("workbenchRepair.backToFiles")}
        </Button>
      </div>
      <div className='min-h-0 flex-1 overflow-auto'>
        <div className='space-y-3 border-b px-4 py-3'>
          <p className='max-w-prose text-xs text-muted-foreground'>
            {t("workbenchRepair.fidelityNotice")}
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={rescan}>
              {t(
                scan.isPending
                  ? "workbenchRepair.scanning"
                  : scan.data
                    ? "workbenchRepair.rescan"
                    : "workbenchRepair.scan",
              )}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={busy || !scan.data || needsScan}
              onClick={() => compile.mutate()}>
              {t(
                compile.isPending
                  ? "workbenchExplorer.compilingOnly"
                  : "workbenchRepair.compile",
              )}
            </Button>
            {scan.data ? (
              <span className='text-xs text-muted-foreground'>
                {t("workbenchRepair.scannedFiles", {
                  count: scan.data.scannedFiles,
                })}
              </span>
            ) : null}
          </div>
          {needsScan && !busy ? (
            <p role='status' className='text-xs'>
              {t("workbenchRepair.needsScan")}
            </p>
          ) : null}
          {error ? (
            <p role='alert' className='break-words text-sm text-destructive'>
              {String(error)}
            </p>
          ) : null}
          {apply.data ? (
            <p role='status' className='text-xs'>
              {t("workbenchRepair.applied", {
                count: apply.data.files.length,
                id: apply.data.backupId,
              })}
            </p>
          ) : null}
          {restore.isSuccess ? (
            <p role='status' className='text-xs'>
              {t("workbenchRepair.restoreComplete")}
            </p>
          ) : null}
          {compile.data ? (
            <p role='status' className='break-all text-xs'>
              {t("workbenchRepair.compileComplete", { log: compile.data })}
            </p>
          ) : null}
        </div>
        {scan.data ? (
          <>
            {scan.data.diagnostics.length ? (
              <details
                className='border-b px-4 py-3 text-xs text-muted-foreground'
                open>
                <summary className='cursor-pointer font-medium'>
                  {t("workbenchRepair.scanLimitations")}
                </summary>
                <ul className='mt-2 space-y-1'>
                  {scan.data.diagnostics.map((diagnostic) => (
                    <li key={diagnostic} className='break-words'>
                      {diagnostic}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div
              className='flex flex-wrap items-center gap-2 border-b px-4 py-2'
              role='group'
              aria-label={t("workbenchRepair.results")}>
              <Button
                size='sm'
                variant={view === "repairs" ? "secondary" : "ghost"}
                aria-pressed={view === "repairs"}
                onClick={() => setView("repairs")}>
                {t("workbenchRepair.repairCount", { count: repairs.length })}
              </Button>
              <Button
                size='sm'
                variant={view === "review" ? "secondary" : "ghost"}
                aria-pressed={view === "review"}
                onClick={() => setView("review")}>
                {t("workbenchRepair.reviewCount", { count: review.length })}
              </Button>
              {view === "repairs" && repairs.length ? (
                <Button
                  size='sm'
                  variant='ghost'
                  disabled={busy || needsScan}
                  onClick={() =>
                    setSelected(
                      selected.size === repairs.length
                        ? new Set()
                        : new Set(repairs.map((issue) => issue.id)),
                    )
                  }>
                  {t(
                    selected.size === repairs.length
                      ? "workbenchRepair.clearSelection"
                      : "workbenchRepair.selectAll",
                  )}
                </Button>
              ) : null}
            </div>
            <ul aria-label={t("workbenchRepair.results")}>
              {visible.map((issue) => (
                <RepairIssueRow
                  key={issue.id}
                  issue={issue}
                  selected={selected.has(issue.id)}
                  disabled={busy || needsScan}
                  onSelect={(checked) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (checked) next.add(issue.id);
                      else next.delete(issue.id);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
            {!visible.length ? (
              <p className='px-4 py-6 text-sm text-muted-foreground'>
                {t(
                  view === "repairs"
                    ? "workbenchRepair.noRepairs"
                    : "workbenchRepair.noReview",
                )}
              </p>
            ) : null}
          </>
        ) : (
          <p className='px-4 py-6 text-sm text-muted-foreground'>
            {t(
              scan.isPending
                ? "workbenchRepair.scanProgress"
                : "workbenchRepair.scanHint",
            )}
          </p>
        )}
        <RepairBackups
          backups={backups.data ?? []}
          disabled={busy}
          restoring={restore.isPending ? restore.variables : undefined}
          onRestore={(id) => restore.mutate(id)}
        />
      </div>
      <div className='flex flex-wrap items-center justify-between gap-3 border-t bg-muted/15 px-4 py-3'>
        <p className='max-w-prose text-xs text-muted-foreground'>
          {t("workbenchRepair.backupNotice")}
        </p>
        <Button
          size='sm'
          disabled={busy || needsScan || !selected.size}
          onClick={() => apply.mutate()}>
          {t(
            apply.isPending
              ? "workbenchRepair.applying"
              : "workbenchRepair.applySelected",
            { count: selected.size },
          )}
        </Button>
      </div>
    </section>
  );
}
