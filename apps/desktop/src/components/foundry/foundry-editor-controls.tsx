import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCounterClockwiseIcon,
  StarIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import type { FoundryEntry } from "@/types/foundry";
import { useFoundry } from "./foundry-context";

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

/**
 * The per-entry actions: swap a file in, undo that swap, and mark a model as the
 * skin's primary one.
 *
 * Recoloring deliberately does not live here. Colour is a property of a *part*
 * of the hero, not of one file, so it belongs to the paint tab, which repaints
 * every texture of a part at once. Cards are swap-only for the same reason:
 * tinting one card would just make it disagree with the others.
 */
export const FoundryEditorControls = ({ entry }: { entry: FoundryEntry }) => {
  const { t } = useTranslation();
  const {
    workspace,
    busy,
    editedPaths,
    replaceEntry,
    revertEntry,
    primaryModelPath,
    setPrimaryModelPath,
  } = useFoundry();
  const isEdited = editedPaths.has(entry.path);
  const disabled = !workspace || busy;
  const isPrimary = primaryModelPath === entry.path;

  const handleReplace = useCallback(async () => {
    const filters = isTexture(entry)
      ? [{ name: "Image", extensions: IMAGE_EXTENSIONS }]
      : isSound(entry)
        ? [{ name: "Audio", extensions: SOUND_EXTENSIONS }]
        : [{ name: entry.ext, extensions: [entry.ext] }];
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: t("foundry.editor.replaceTitle"),
      filters,
    });
    if (!selected || typeof selected !== "string") return;
    try {
      await replaceEntry(entry.path, selected);
      toast.success(t("foundry.editor.replaced", { file: entry.filename }));
    } catch (err) {
      logger.withError(err).error("[Foundry] Replace failed");
      toast.error(t("foundry.editor.replaceFailed"));
    }
  }, [entry, replaceEntry, t]);

  const handleRevert = useCallback(async () => {
    try {
      await revertEntry(entry.path);
      toast.success(t("foundry.editor.reverted", { file: entry.filename }));
    } catch (err) {
      logger.withError(err).error("[Foundry] Revert failed");
      toast.error(t("foundry.editor.revertFailed"));
    }
  }, [entry, revertEntry, t]);

  const replaceHint = isTexture(entry)
    ? t("foundry.editor.replaceImageHint")
    : isSound(entry)
      ? t("foundry.editor.replaceSoundHint")
      : t("foundry.editor.replaceFileHint", { ext: entry.ext });

  return (
    <div className='space-y-4'>
      <Separator />

      {isModel(entry) && (
        <div className='space-y-2'>
          <Label className='text-muted-foreground text-xs'>
            {t("foundry.editor.primaryLabel")}
          </Label>
          <p className='text-muted-foreground text-xs'>
            {t("foundry.editor.primaryHint")}
          </p>
          <Button
            className='w-full'
            disabled={isPrimary}
            icon={
              <StarIcon
                className='h-4 w-4'
                weight={isPrimary ? "fill" : "regular"}
              />
            }
            onClick={() => setPrimaryModelPath(entry.path)}
            size='sm'
            variant={isPrimary ? "secondary" : "outline"}>
            {t(
              isPrimary
                ? "foundry.editor.isPrimary"
                : "foundry.editor.setPrimary",
            )}
          </Button>
        </div>
      )}

      <div className='space-y-2'>
        <Label className='text-muted-foreground text-xs'>
          {t("foundry.editor.replaceLabel")}
        </Label>
        <p className='text-muted-foreground text-xs'>{replaceHint}</p>
        <div className='flex gap-2'>
          <Button
            className='flex-1'
            disabled={disabled}
            icon={<UploadSimpleIcon className='h-4 w-4' />}
            onClick={handleReplace}
            size='sm'
            variant='outline'>
            {t("foundry.editor.replace")}
          </Button>
          <Button
            disabled={disabled || !isEdited}
            icon={<ArrowCounterClockwiseIcon className='h-4 w-4' />}
            onClick={handleRevert}
            size='sm'
            variant='ghost'>
            {t("foundry.editor.revert")}
          </Button>
        </div>
      </div>

      {!workspace && (
        <p className='rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs'>
          {t("foundry.editor.workspacePending")}
        </p>
      )}
    </div>
  );
};
