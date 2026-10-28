import { Switch } from "@deadlock-mods/ui/components/switch";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryEntry } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryDropZone } from "./foundry-drop-zone";

/** Image formats the backend can re-encode into a `.vtex_c` container. */
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tga",
  "tif",
  "tiff",
  "qoi",
];

/** Audio the backend can mint into a `.vsnd_c`, plus the compiled form itself. */
const SOUND_EXTENSIONS = ["mp3", "wav", "vsnd_c"];

const isTexture = (entry: FoundryEntry): boolean => entry.ext === "vtex_c";
const isSound = (entry: FoundryEntry): boolean => entry.ext === "vsnd_c";
const isModel = (entry: FoundryEntry): boolean =>
  entry.ext === "vmdl_c" || entry.ext === "vmesh_c";

const InspectorSection = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <section className='space-y-2.5 border-t px-4 py-3.5'>
    <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
      {label}
    </h3>
    {children}
  </section>
);

/** Replace a file by dropping or picking one, and undo that again. */
const FoundryReplaceControls = ({ entry }: { entry: FoundryEntry }) => {
  const { t } = useTranslation();
  const { workspace, busy, editedPaths, replaceEntry, revertEntry } =
    useFoundry();
  const isEdited = editedPaths.has(entry.path);
  const disabled = !workspace || busy;

  const handleReplace = useCallback(
    async (path: string) => {
      try {
        await replaceEntry(entry.path, path);
        toast.success(t("foundry.editor.replaced", { file: entry.filename }));
      } catch (err) {
        logger.withError(err).error("[Foundry] Replace failed");
        toast.error(t("foundry.editor.replaceFailed"));
      }
    },
    [entry, replaceEntry, t],
  );

  const handleRevert = useCallback(async () => {
    try {
      await revertEntry(entry.path);
      toast.success(t("foundry.editor.reverted", { file: entry.filename }));
    } catch (err) {
      logger.withError(err).error("[Foundry] Revert failed");
      toast.error(t("foundry.editor.revertFailed"));
    }
  }, [entry, revertEntry, t]);

  const extensions = isTexture(entry)
    ? IMAGE_EXTENSIONS
    : isSound(entry)
      ? SOUND_EXTENSIONS
      : [entry.ext];
  const title = isTexture(entry)
    ? t("foundry.drop.image")
    : isSound(entry)
      ? t("foundry.drop.sound")
      : t("foundry.drop.file", { ext: entry.ext });

  return (
    <>
      <FoundryDropZone
        dialogTitle={t("foundry.editor.replaceTitle")}
        disabled={disabled}
        extensions={extensions}
        onFile={handleReplace}
        title={title}
      />
      <button
        className={cn(
          "flex items-center gap-1.5 font-medium text-xs transition-colors",
          isEdited && !disabled
            ? "text-foreground hover:text-primary"
            : "pointer-events-none text-muted-foreground/50",
        )}
        disabled={!isEdited || disabled}
        onClick={handleRevert}
        type='button'>
        <ArrowCounterClockwiseIcon className='h-[13px] w-[13px]' />
        {t("foundry.editor.revertToOriginal")}
      </button>
      {!workspace && (
        <p className='rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs'>
          {t("foundry.editor.workspacePending")}
        </p>
      )}
    </>
  );
};

/**
 * The per-entry actions: mark a model as the skin's primary one, and swap a
 * file in or undo that swap.
 *
 * Recoloring deliberately does not live here. Colour is a property of a *part*
 * of the hero, not of one file, so it belongs to the paint tab, which repaints
 * every texture of a part at once.
 */
export const FoundryEditorControls = ({ entry }: { entry: FoundryEntry }) => {
  const { t } = useTranslation();
  const { primaryModelPath, setPrimaryModelPath } = useFoundry();
  const isPrimary = primaryModelPath === entry.path;

  return (
    <>
      {isModel(entry) && (
        <InspectorSection label={t("foundry.editor.primaryLabel")}>
          <div className='flex items-center gap-3'>
            <label
              className='flex-1 text-xs leading-[1.4]'
              htmlFor='foundry-primary-model'>
              {t("foundry.editor.primaryHint")}
            </label>
            <Switch
              checked={isPrimary}
              disabled={isPrimary}
              id='foundry-primary-model'
              onCheckedChange={(on) => on && setPrimaryModelPath(entry.path)}
            />
          </div>
        </InspectorSection>
      )}
      <InspectorSection label={t("foundry.editor.replaceLabel")}>
        <FoundryReplaceControls entry={entry} />
      </InspectorSection>
    </>
  );
};
