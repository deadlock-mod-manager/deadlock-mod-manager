import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@deadlock-mods/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getErrorMessage } from "@/lib/errors";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingVariant } from "@/types/generated/ModdingVariant";
import type { ModdingImageBuild } from "@/types/generated/ModdingImageBuild";
import { VariantImageList } from "./variant-image-list";
interface BuildRow {
  variant: ModdingVariant;
  state: "queued" | "building" | "complete" | "failed" | "skipped";
  detail: string;
}
export const VariantBuildDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(new Set<string>());
  const [rows, setRows] = useState<BuildRow[]>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [destination, setDestination] = useState("");
  const [directory, setDirectory] = useState("");
  const [excluded, setExcluded] = useState(new Map<string, string[]>());
  const stop = useRef(false);
  const discover = useMutation({
    mutationFn: async (path?: string) => {
      const root = path ?? (await open({ directory: true, multiple: false }));
      if (!root) return;
      setDirectory(root);
      const variants = await invoke<ModdingVariant[]>(
        "discover_modding_variants",
        { directory: root },
      );
      setRows(
        variants.map((variant) => ({ variant, state: "queued", detail: "" })),
      );
      setSelected(new Set(variants.map((variant) => variant.contentPath)));
    },
  });
  const chooseDestination = useMutation({
    mutationFn: async () => {
      const path = await open({ directory: true, multiple: false });
      if (path) setDestination(path);
    },
  });
  const build = useMutation({
    mutationKey: ["workbench-build"],
    mutationFn: async () => {
      stop.current = false;
      const update = (path: string, state: BuildRow["state"], detail = "") =>
        setRows((previous) =>
          previous.map((row) =>
            row.variant.contentPath === path ? { ...row, state, detail } : row,
          ),
        );
      for (const { variant } of rows) {
        if (stop.current || !selected.has(variant.contentPath)) {
          update(variant.contentPath, "skipped");
          continue;
        }
        update(variant.contentPath, "building");
        try {
          const result = await invoke<ModdingImageBuild>(
            "build_modding_variant",
            {
              variant,
              destination,
              excluded: excluded.get(variant.contentPath) ?? [],
            },
          );
          update(variant.contentPath, "complete", result.outputs.join("\n"));
        } catch (error) {
          update(variant.contentPath, "failed", getErrorMessage(error));
        }
      }
    },
  });
  const busy = build.isPending || discover.isPending;
  const error = discover.error ?? chooseDestination.error ?? build.error;
  return (
    <Dialog
      modal={false}
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}>
      <DialogContent className='flex max-h-[88vh] max-w-4xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t("workbenchAuthoring.variantBuilds")}</DialogTitle>
          <DialogDescription>
            {t("workbenchAuthoring.variantHint")}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => discover.mutate(undefined)}>
            {t("workbenchAuthoring.chooseVariantRoot")}
          </Button>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => chooseDestination.mutate()}>
            {t("workbenchAuthoring.chooseOutput")}
          </Button>
          <Button
            disabled={busy || !selected.size || !destination}
            onClick={() => build.mutate()}>
            {t("workbenchAuthoring.buildSelectedVariants")}
          </Button>
          {build.isPending ? (
            <Button
              variant='outline'
              onClick={() => {
                stop.current = true;
              }}>
              {t("workbenchAuthoring.stopAfterCurrent")}
            </Button>
          ) : null}
        </div>
        <div className='flex gap-2'>
          <Input
            aria-label={t("workbenchAuthoring.variantRootPath")}
            placeholder={t("workbenchAuthoring.variantRootPath")}
            value={directory}
            disabled={busy}
            onChange={(event) => setDirectory(event.target.value)}
          />
          <Button
            variant='outline'
            disabled={busy || !directory.trim()}
            onClick={() => discover.mutate(directory.trim())}>
            {t("workbenchAuthoring.scanVariants")}
          </Button>
        </div>
        <Input
          aria-label={t("workbenchAuthoring.variantOutputPath")}
          placeholder={t("workbenchAuthoring.variantOutputPath")}
          value={destination}
          disabled={busy}
          onChange={(event) => setDestination(event.target.value)}
        />
        <div className='min-h-24 flex-1 overflow-auto'>
          {rows.map((row) => (
            <div key={row.variant.contentPath} className='border-b py-2'>
              <div className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  aria-label={t("workbenchAuthoring.selectFile", {
                    path: row.variant.name,
                  })}
                  checked={selected.has(row.variant.contentPath)}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (checked) next.add(row.variant.contentPath);
                      else next.delete(row.variant.contentPath);
                      return next;
                    });
                  }}
                />
                <span
                  className='min-w-0 flex-1 truncate text-sm'
                  title={row.variant.contentPath}>
                  {row.variant.name}
                </span>
                <span role='status' className='text-xs'>
                  {t(`workbenchAuthoring.queue_${row.state}`)}
                </span>
              </div>
              {row.detail ? (
                <p
                  role={row.state === "failed" ? "alert" : "status"}
                  className={`whitespace-pre-wrap break-all py-1 font-mono text-xs ${row.state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                  {row.detail}
                </p>
              ) : null}
              <details
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (open) next.add(row.variant.contentPath);
                    else next.delete(row.variant.contentPath);
                    return next;
                  });
                }}>
                <summary className='cursor-pointer py-1 pl-6 text-xs'>
                  {t("workbenchAuthoring.imageExclusions")}
                </summary>
                {expanded.has(row.variant.contentPath) ? (
                  <VariantImageList
                    directory={row.variant.contentPath}
                    excluded={excluded.get(row.variant.contentPath) ?? []}
                    disabled={busy}
                    onExclude={(path, exclude) =>
                      setExcluded((previous) => {
                        const next = new Map(previous);
                        const values = new Set(
                          next.get(row.variant.contentPath) ?? [],
                        );
                        if (exclude) values.add(path);
                        else values.delete(path);
                        next.set(row.variant.contentPath, [...values]);
                        return next;
                      })
                    }
                  />
                ) : null}
              </details>
            </div>
          ))}
        </div>
        <p role='status' className='text-xs'>
          {t("workbenchAuthoring.queueSummary", {
            complete: rows.filter((row) => row.state === "complete").length,
            failed: rows.filter((row) => row.state === "failed").length,
            skipped: rows.filter((row) => row.state === "skipped").length,
          })}
        </p>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error.message}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
