import { useTranslation } from "react-i18next";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { ParticlePreview } from "./particle-preview";

export function ParticleDraftPreview({
  addon,
  file,
  dirty,
  rawChanged,
}: {
  addon: ModdingAddon;
  file: ModdingParticleFile | undefined;
  dirty: ModdingParticleFile[];
  rawChanged: boolean;
}) {
  const { t } = useTranslation();
  const diagnostic =
    dirty.find((file) => file.diagnostic)?.diagnostic ?? file?.diagnostic;
  const sources = file
    ? [...dirty.filter((draft) => draft.path !== file.path), file]
    : [];
  return (
    <aside
      className='flex min-h-0 w-80 shrink-0 flex-col border-l'
      aria-label={t("particleColors.draftPreview")}>
      <div className='shrink-0 space-y-1 border-b p-3'>
        <h3 className='text-sm font-medium'>
          {t("particleColors.draftPreview")}
        </h3>
        <p className='text-[11px] text-muted-foreground'>
          {t(
            rawChanged
              ? "particleColors.previewApplyRaw"
              : "particleColors.draftHint",
          )}
        </p>
      </div>
      {file && !diagnostic ? (
        <ParticlePreview
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
