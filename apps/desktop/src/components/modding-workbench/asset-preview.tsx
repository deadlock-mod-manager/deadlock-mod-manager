import { Button } from "@deadlock-mods/ui/components/button";
import { CubeIcon, InfoIcon } from "@phosphor-icons/react";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { ParticleColorsDialog } from "./particle-colors-dialog";
import { ResourceInspector } from "./resource-inspector";
import { useTranslation } from "react-i18next";
import { AnimatedModelPreview } from "@/components/foundry/animated-model-preview";
import { FoundryModelViewer } from "@/components/foundry/foundry-model-viewer";
import {
  cacheFoundryModel,
  decodeFoundryModel,
  decodeModdingSourceModel,
  MODEL_PREVIEW_GC_TIME,
} from "@/lib/model-assets";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingFile } from "@/types/generated/ModdingFile";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import { AddonAudioPreview } from "./addon-audio-preview";
import { AddonDmxPreview } from "./addon-dmx-preview";
import { ParticlePreview } from "./particle-preview";
import { DocumentTextView } from "./document-text-view";

type PreviewLocation =
  | { kind: "addon"; addon: ModdingAddon; hierarchy: ModdingHierarchy }
  | { kind: "archive"; archivePath: string };

interface Props {
  location: PreviewLocation;
  path: string;
  revision: number;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}

export const AssetPreview = ({
  location,
  path,
  revision,
  onDirtyChange,
  onSaved,
}: Props) => {
  const [dirty, setDirty] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const fullscreen = useRef<HTMLDivElement>(null);
  const isResource = /\.(vmat|vpcf|vdata|vsndevts)(_c)?$/i.test(path);
  const archive = location.kind === "archive";
  const addon = location.kind === "addon" ? location.addon : undefined;
  const addonId = addon?.id;
  const archivePath =
    location.kind === "archive"
      ? location.archivePath
      : location.addon.archivePath;
  const hierarchy = location.kind === "addon" ? location.hierarchy : "game";
  const sourceId = addonId ?? archivePath;
  const localSource = addonId?.startsWith("local:") ?? false;
  const requiresCompiledCheck =
    hierarchy === "content" || (localSource && !path.endsWith("_c"));
  const { t } = useTranslation();
  const client = useQueryClient();
  const isClip = /\.vnmclip(_c)?$/.test(path);
  const clipModel = useQuery({
    queryKey: ["workbench-clip-model", sourceId, path, revision, archive],
    queryFn: () =>
      invoke<string | null>("find_modding_clip_model", {
        addonId,
        clip: path,
        archive,
        archivePath,
      }),
    enabled: isClip,
  });
  const isParticle = /\.vpcf(_c)?$/i.test(path);
  const isModel = /\.(vmdl|vmesh)(_c)?$/i.test(path);
  const sourceModel =
    !!addon && hierarchy === "content" && /\.vmdl$/i.test(path);
  const sourceParticle =
    !!addon && hierarchy === "content" && /\.vpcf$/i.test(path);
  const particle = useQuery({
    queryKey: ["workbench-particle-colors", addonId, revision],
    queryFn: () =>
      invoke<ModdingParticleFile[]>("list_modding_particle_colors", {
        addonId,
        scope: "",
      }),
    select: (files) => files.find((file) => file.path === path),
    enabled: sourceParticle,
  });
  const isImage = /\.(png|jpe?g|tga|webp|bmp|gif|vtex_c)$/i.test(path);
  const isAudio = /\.(mp3|wav|ogg|flac|m4a|aac|vsnd_c)$/i.test(path);
  const isDmx = /\.dmx$/i.test(path);
  const isText =
    !!path &&
    !isModel &&
    !isClip &&
    !isParticle &&
    !isDmx &&
    !isImage &&
    !isAudio;
  const entryPath = isClip
    ? (clipModel.data ?? "")
    : path.endsWith("_c")
      ? path
      : `${path}_c`;
  const compiledFiles = useQuery({
    queryKey: [
      "workbench-files",
      sourceId,
      "game",
      entryPath.split("/").slice(0, -1).join("/"),
      revision,
    ],
    queryFn: () =>
      invoke<ModdingFile[]>("list_modding_files", {
        addonId,
        hierarchy: "game",
        directory: entryPath.split("/").slice(0, -1).join("/"),
      }),
    enabled:
      (isModel || isParticle) &&
      requiresCompiledCheck &&
      !archive &&
      !sourceModel &&
      !sourceParticle,
  });
  const needsCompile =
    (isModel || isParticle) &&
    !sourceModel &&
    !sourceParticle &&
    !archive &&
    requiresCompiledCheck &&
    compiledFiles.data !== undefined &&
    !compiledFiles.data.some((file) => file.path === entryPath);
  const canPreviewModel =
    isModel &&
    (sourceModel ||
      archive ||
      (hierarchy === "game" && !requiresCompiledCheck) ||
      compiledFiles.data?.some((file) => file.path === entryPath));
  const key = [
    sourceModel ? "workbench-source-model" : "workbench-model",
    sourceId,
    sourceModel ? path : entryPath,
    revision,
    archive,
  ];
  const model = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result =
        sourceModel && addon
          ? await decodeModdingSourceModel(addon.id, path, signal)
          : await decodeFoundryModel(
              archivePath,
              entryPath,
              null,
              signal,
              archive ? undefined : addon?.gamePath,
            );
      cacheFoundryModel(client, key, result);
      return result;
    },
    enabled: canPreviewModel || (isClip && !!entryPath),
    gcTime: MODEL_PREVIEW_GC_TIME,
    staleTime: 60_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true, foregroundPreview: true },
  });
  const image = useQuery({
    queryKey: ["workbench-image", sourceId, hierarchy, path, revision, archive],
    queryFn: () =>
      invoke<string>(
        archive ? "preview_modding_archive_file" : "preview_modding_image",
        {
          addonId,
          hierarchy,
          path,
          archivePath,
        },
      ),
    enabled: isImage,
    gcTime: 0,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const text = useQuery({
    queryKey: ["workbench-text", sourceId, hierarchy, path, revision, archive],
    queryFn: () =>
      invoke<string>(
        archive ? "preview_modding_archive_file" : "preview_modding_text",
        { addonId, hierarchy, path, archivePath },
      ),
    enabled: isText && !(isResource && inspecting),
    retry: false,
    gcTime: 0,
    meta: { skipGlobalErrorHandler: true },
  });
  const error =
    model.error ??
    image.error ??
    text.error ??
    clipModel.error ??
    compiledFiles.error ??
    particle.error ??
    (particle.data?.diagnostic ? new Error(particle.data.diagnostic) : null);
  return (
    <section
      className='flex h-full min-h-0 flex-col'
      aria-label={t("workbenchExplorer.preview")}>
      <div className='flex min-h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/60 px-3 py-2'>
        <h2 className='min-w-0 truncate text-xs font-medium' title={path}>
          {path ? path.split("/").at(-1) : t("workbenchExplorer.preview")}
        </h2>
        {isModel || isClip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant='outline'
                tabIndex={0}
                className='shrink-0 gap-1.5 text-[10px] font-normal text-muted-foreground'>
                <InfoIcon className='size-3' />
                {t(
                  sourceModel
                    ? "workbenchAssets.sourcePreview"
                    : "workbenchAssets.compiledPreview",
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className='max-w-72'>
              {t(
                sourceModel
                  ? "workbenchAssets.sourcePreviewHint"
                  : archive
                    ? "workbenchExplorer.archivePreview"
                    : "workbenchExplorer.compiledPreview",
              )}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {isResource ? (
        <div className='flex gap-1 border-b p-2'>
          <Button
            size='sm'
            variant={inspecting ? "ghost" : "secondary"}
            disabled={dirty}
            onClick={() => setInspecting(false)}>
            {t("workbenchExplorer.preview")}
          </Button>
          {isParticle &&
          addon &&
          !localSource &&
          hierarchy === "content" &&
          !path.endsWith("_c") ? (
            <Button
              size='sm'
              variant='ghost'
              disabled={dirty}
              onClick={() => {
                setColorsOpen(true);
                setDirty(true);
                onDirtyChange?.(true);
              }}>
              {t("particleColors.title")}
            </Button>
          ) : null}
          <Button
            size='sm'
            variant={inspecting ? "secondary" : "ghost"}
            onClick={() => setInspecting(true)}>
            {t("workbenchAuthoring.inspectEdit")}
          </Button>
        </div>
      ) : null}
      {colorsOpen && addon ? (
        <ParticleColorsDialog
          addon={addon}
          initialPath={path}
          onClose={() => {
            setColorsOpen(false);
            setDirty(false);
            onDirtyChange?.(false);
          }}
          onSaved={() => onSaved?.()}
        />
      ) : null}
      <div className='min-h-0 flex-1 p-2'>
        {isResource && inspecting ? (
          <ResourceInspector
            key={`${sourceId}:${path}`}
            addonId={addonId}
            archivePath={archivePath}
            hierarchy={hierarchy}
            path={path}
            revision={revision}
            onDirtyChange={(value) => {
              setDirty(value);
              onDirtyChange?.(value);
            }}
            onSaved={onSaved}
          />
        ) : isParticle &&
          !needsCompile &&
          ((sourceParticle && !!particle.data && !particle.data.diagnostic) ||
            (!sourceParticle &&
              (archive ||
                (hierarchy === "game" && !requiresCompiledCheck) ||
                compiledFiles.data?.some(
                  (file) => file.path === entryPath,
                )))) ? (
          <ParticlePreview
            key={`${sourceId}:${path}:${revision}:${archive}`}
            source={{
              filePath: archivePath,
              entryPath,
              overlayRoot: archive ? undefined : addon?.gamePath,
              revision,
            }}
            drafts={
              particle.data && addon
                ? {
                    addonId: addon.id,
                    version: particle.data.fingerprint,
                    files: [
                      { path: particle.data.path, text: particle.data.text },
                    ],
                  }
                : undefined
            }
          />
        ) : isDmx && addon ? (
          <AddonDmxPreview
            key={`${sourceId}:${hierarchy}:${path}:${revision}`}
            addonId={addon.id}
            hierarchy={hierarchy}
            path={path}
            revision={revision}
          />
        ) : isAudio ? (
          <AddonAudioPreview
            key={`${sourceId}:${hierarchy}:${path}:${revision}`}
            addonId={addonId}
            hierarchy={hierarchy}
            path={path}
            revision={revision}
            archive={archive}
            archivePath={archivePath}
          />
        ) : !needsCompile && (isModel || isClip) && model.data ? (
          "meshes" in model.data ? (
            <div ref={fullscreen} className='h-full min-h-0'>
              <FoundryModelViewer
                model={model.data}
                label={path}
                fullscreenTarget={fullscreen}
              />
            </div>
          ) : (
            <AnimatedModelPreview
              key={`${sourceId}:${entryPath}:${isClip ? path : ""}:${revision}`}
              clipPath={
                isClip ? (path.endsWith("_c") ? path : `${path}_c`) : undefined
              }
              model={model.data}
              label={path}
              source={{
                filePath: archivePath,
                entryPath,
                overlayRoot: archive ? undefined : addon?.gamePath,
                allowAdditiveReference: isClip,
                revision,
              }}
            />
          )
        ) : isImage && image.data ? (
          <div className='flex h-full items-center justify-center overflow-auto bg-muted/20 p-3'>
            <img
              src={image.data}
              alt={path}
              className='max-h-full max-w-full object-contain'
            />
          </div>
        ) : isText && text.data !== undefined ? (
          <div className='flex h-full min-h-0 flex-col rounded bg-muted/20'>
            <p className='shrink-0 border-b px-3 py-2 text-[11px] text-muted-foreground'>
              {t(
                path.toLowerCase().endsWith("_c")
                  ? "workbenchExplorer.decodedDocument"
                  : "workbenchExplorer.textDocument",
              )}
            </p>
            <DocumentTextView
              key={`${sourceId}:${hierarchy}:${path}`}
              text={text.data}
            />
          </div>
        ) : (
          <div className='flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-sm text-muted-foreground'>
            <CubeIcon className='size-8' />
            <p role={error ? "alert" : "status"}>
              {error
                ? error.message
                : needsCompile
                  ? t("workbenchExplorer.compileFirst")
                  : ((canPreviewModel || (isClip && !!entryPath)) &&
                        model.isPending) ||
                      (isModel &&
                        hierarchy === "content" &&
                        compiledFiles.isPending) ||
                      (isClip && clipModel.isPending) ||
                      (isImage && image.isPending) ||
                      (isText && text.isPending) ||
                      (isParticle && compiledFiles.isPending)
                    ? t("common.loading")
                    : t(
                        path
                          ? "workbenchExplorer.noPreview"
                          : "workbenchExplorer.chooseFile",
                      )}
            </p>
            {error ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() =>
                  void (isModel || isClip
                    ? model.refetch()
                    : isText
                      ? text.refetch()
                      : image.refetch())
                }>
                {t("skins.preview.retry")}
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {model.data && "meshes" in model.data && model.data.diagnostics.length ? (
        <details className='shrink-0 border-t px-3 py-2 text-xs text-muted-foreground'>
          <summary className='cursor-pointer'>
            {t("workbenchAssets.sourceWarnings")}
          </summary>
          {model.data.diagnostics.map((diagnostic) => (
            <p key={diagnostic} className='pt-1'>
              {diagnostic}
            </p>
          ))}
        </details>
      ) : null}
    </section>
  );
};
