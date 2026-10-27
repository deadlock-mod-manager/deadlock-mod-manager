import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import {
  CubeIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { particleHex } from "@/lib/particle-colors";
import { cn } from "@/lib/utils";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { AssetThumbnailRenderer } from "./asset-thumbnail-renderer";

interface Props {
  addon: ModdingAddon;
  hierarchy: ModdingHierarchy;
  revision: number;
  selected: string;
  onSelect: (path: string) => void;
}
const PAGE_SIZE = 24;

export function AddonAssetGrid({
  addon,
  hierarchy,
  revision,
  selected,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const foregroundPreview =
    useIsFetching({
      predicate: (query) => query.meta?.foregroundPreview === true,
    }) > 0;
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const thumbnailKey = ["workbench-thumbnails", addon.id];
  const { data: thumbnails } = useQuery({
    queryKey: thumbnailKey,
    queryFn: () => new Map<string, string | null>(),
    initialData: () => new Map<string, string | null>(),
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const files = useQuery({
    queryKey: ["workbench-batch-files", addon.id, hierarchy, revision],
    queryFn: () =>
      invoke<string[]>("list_modding_batch_files", {
        addonId: addon.id,
        hierarchy,
      }),
  });
  const particles = useQuery({
    queryKey: ["workbench-particle-colors", addon.id, revision],
    queryFn: () =>
      invoke<ModdingParticleFile[]>("list_modding_particle_colors", {
        addonId: addon.id,
        scope: "",
      }),
    enabled:
      hierarchy === "content" &&
      files.data?.some((path) => /\.vpcf$/i.test(path)),
    refetchOnWindowFocus: false,
  });
  const visible = (files.data ?? []).filter(
    (path) =>
      /\.(vmdl|vpcf)(_c)?$/i.test(path) &&
      (kind === "all" ||
        (kind === "models" ? /\.vmdl(_c)?$/i : /\.vpcf(_c)?$/i).test(path)) &&
      path.toLowerCase().includes(filter.toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1),
  );
  const pageFiles = visible.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const sourceParticles = useMemo(
    () => new Map((particles.data ?? []).map((file) => [file.path, file])),
    [particles.data],
  );
  const canPreview = (path: string) =>
    hierarchy === "game" ||
    /\.vmdl$/i.test(path) ||
    (sourceParticles.has(path) && !sourceParticles.get(path)?.diagnostic);
  const imageKey = (path: string) => `${hierarchy}:${revision}:${path}`;
  const pending = foregroundPreview
    ? undefined
    : pageFiles.find(
        (path) => !thumbnails.has(imageKey(path)) && canPreview(path),
      );
  return (
    <section
      className='flex h-full min-h-0 flex-col'
      aria-label={t("workbenchAssets.title")}>
      <div className='flex gap-2 border-b p-3'>
        <div className='relative min-w-0 flex-1'>
          <MagnifyingGlassIcon
            aria-hidden
            className='absolute left-2.5 top-2.5 size-4 text-muted-foreground'
          />
          <Input
            className='h-9 pl-8 text-xs'
            value={filter}
            aria-label={t("workbenchAssets.search")}
            placeholder={t("workbenchAssets.search")}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select
          value={kind}
          onValueChange={(value) => {
            setKind(value);
            setPage(0);
          }}>
          <SelectTrigger
            className='h-9 w-32 text-xs'
            aria-label={t("workbenchAssets.filter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["all", "models", "particles"].map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`workbenchAssets.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='min-h-0 flex-1 overflow-auto p-3'>
        {files.error || particles.error ? (
          <p role='alert' className='mb-3 text-xs text-destructive'>
            {String(files.error ?? particles.error)}
          </p>
        ) : null}
        <div className='grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5'>
          {pageFiles.map((path) => {
            const model = /\.vmdl(_c)?$/i.test(path);
            const image = thumbnails.get(imageKey(path));
            const palette = [
              ...new Set(
                sourceParticles
                  .get(path)
                  ?.colors.map((color) => particleHex(color.rgb)),
              ),
            ].slice(0, 6);
            return (
              <button
                type='button'
                key={path}
                title={path}
                aria-pressed={selected === path}
                onClick={() => onSelect(path)}
                className={cn(
                  "group min-w-0 overflow-hidden rounded-md border bg-background/65 text-left transition-colors focus-visible:outline focus-visible:outline-ring",
                  selected === path
                    ? "border-primary bg-primary/10"
                    : "border-border/70 hover:border-primary/50 hover:bg-muted/60",
                )}>
                <span className='relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/30'>
                  {image ? (
                    <img
                      src={image}
                      alt={t(
                        model
                          ? "workbenchAssets.modelPreview"
                          : "workbenchAssets.particlePreview",
                      )}
                      className='size-full object-cover'
                    />
                  ) : model ? (
                    <CubeIcon
                      aria-hidden
                      weight='duotone'
                      className='size-8 text-muted-foreground/50'
                    />
                  ) : (
                    <SparkleIcon
                      aria-hidden
                      weight='duotone'
                      className='size-8 text-muted-foreground/50'
                    />
                  )}
                  <Badge
                    variant='secondary'
                    className='absolute right-1.5 top-1.5 rounded px-1 text-[9px] font-medium'>
                    {model ? "VMDL" : "VPCF"}
                  </Badge>
                  {pending === path ? (
                    <CircleNotchIcon
                      role='status'
                      aria-label={t("workbenchAssets.generatingPreview")}
                      className='absolute left-2 top-2 size-3 animate-spin text-muted-foreground'
                    />
                  ) : null}
                  {palette.length ? (
                    <span
                      className='absolute inset-x-0 bottom-0 flex h-1'
                      aria-label={t("workbenchAssets.sourceColors")}>
                      {palette.map((hex) => (
                        <span
                          key={hex}
                          title={hex}
                          className='flex-1'
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className='block space-y-1 px-2.5 py-2'>
                  <span className='block truncate text-xs font-medium'>
                    {path.split("/").at(-1)}
                  </span>
                  <span className='block truncate text-[10px] text-muted-foreground'>
                    {image === null || sourceParticles.get(path)?.diagnostic
                      ? t("workbenchAssets.previewUnavailable")
                      : path.split("/").slice(0, -1).join("/")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {!visible.length ? (
          <p
            role='status'
            className='py-8 text-center text-sm text-muted-foreground'>
            {t(files.isPending ? "common.loading" : "workbenchAssets.empty")}
          </p>
        ) : null}
      </div>
      <div className='flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground'>
        <span>
          {t("workbenchAssets.assetCount", { count: visible.length })}
        </span>
        {visible.length > PAGE_SIZE ? (
          <div className='flex items-center gap-1'>
            <Button
              size='sm'
              variant='ghost'
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}>
              {t("workbenchAssets.previous")}
            </Button>
            <span>
              {t("workbenchAssets.page", {
                page: currentPage + 1,
                count: Math.ceil(visible.length / PAGE_SIZE),
              })}
            </span>
            <Button
              size='sm'
              variant='ghost'
              disabled={(currentPage + 1) * PAGE_SIZE >= visible.length}
              onClick={() => setPage(currentPage + 1)}>
              {t("workbenchAssets.next")}
            </Button>
          </div>
        ) : null}
      </div>
      <AssetThumbnailRenderer
        addon={addon}
        path={pending ?? ""}
        revision={revision}
        hierarchy={hierarchy}
        particle={
          hierarchy === "content" && pending
            ? sourceParticles.get(pending)
            : undefined
        }
        onReady={(image) =>
          pending &&
          client.setQueryData<Map<string, string | null>>(
            thumbnailKey,
            (previous) => {
              const next = new Map(previous);
              next.set(imageKey(pending), image);
              let bytes = [...next.values()].reduce(
                (sum, value) => sum + (value?.length ?? 0),
                0,
              );
              while (next.size > 128 || bytes > 8 * 1024 * 1024) {
                const oldest = next.keys().next().value;
                if (oldest === undefined) break;
                bytes -= next.get(oldest)?.length ?? 0;
                next.delete(oldest);
              }
              return next;
            },
          )
        }
      />
    </section>
  );
}
