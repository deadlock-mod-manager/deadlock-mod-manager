import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { ParticlePreview } from "./particle-preview";

export function ParticleDraftPreview({
  addon,
  file,
  dirty,
  rawChanged,
  proposed = [],
  picking = false,
  pickError = false,
  onColorPicked,
  onCancelPick,
  onPickError,
}: {
  addon: ModdingAddon;
  file: ModdingParticleFile | undefined;
  dirty: ModdingParticleFile[];
  rawChanged: boolean;
  proposed?: ModdingParticleFile[];
  picking?: boolean;
  pickError?: boolean;
  onColorPicked?: (hex: string) => void;
  onCancelPick?: () => void;
  onPickError?: () => void;
}) {
  const { t } = useTranslation();
  const diagnostic =
    dirty.find((file) => file.diagnostic)?.diagnostic ?? file?.diagnostic;
  const sources = [
    ...new Map(
      [...dirty, ...(file ? [file] : []), ...proposed].map((file) => [
        file.path,
        file,
      ]),
    ).values(),
  ];
  return (
    <aside
      className='flex min-h-0 w-80 shrink-0 flex-col border-l'
      aria-label={t("particleColors.draftPreview")}>
      <div className='shrink-0 space-y-1 border-b p-3'>
        <h3 className='text-sm font-medium'>
          {t(
            proposed.length
              ? "particleColors.proposedPreview"
              : "particleColors.draftPreview",
          )}
        </h3>
        <p className='text-[11px] text-muted-foreground'>
          {t(
            picking
              ? "particleColors.pickPreviewHint"
              : rawChanged
                ? "particleColors.previewApplyRaw"
                : proposed.length
                  ? "particleColors.proposedPreviewHint"
                  : "particleColors.draftHint",
          )}
        </p>
        {file ? (
          <p
            className='truncate font-mono text-[10px] text-muted-foreground'
            title={file.path}>
            {file.path.split("/").at(-1)}
          </p>
        ) : null}
        {pickError ? (
          <p role='alert' className='text-xs text-destructive'>
            {t("particleColors.pickPreviewFailed")}
          </p>
        ) : null}
      </div>
      {file && !diagnostic ? (
        <ParticlePreview
          picking={picking}
          onColorPicked={onColorPicked}
          onCancelPick={onCancelPick}
          onPickError={onPickError}
          source={{
            filePath: addon.archivePath,
            entryPath: `${file.path}_c`,
            overlayRoot: addon.gamePath,
          }}
          drafts={{
            addonId: addon.id,
            version: sources
              .map((file) => `${file.path}:${file.fingerprint}`)
              .join("|"),
            files: sources.map(({ path, text }) => ({ path, text })),
          }}
        />
      ) : (
        <p
          role={diagnostic ? "alert" : "status"}
          className='p-3 text-xs text-muted-foreground'>
          {diagnostic ?? t("particleColors.selectPreview")}
        </p>
      )}
    </aside>
  );
}
