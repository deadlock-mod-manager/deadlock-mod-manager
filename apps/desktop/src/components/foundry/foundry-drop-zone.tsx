import { cn } from "@deadlock-mods/ui/lib/utils";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

const DROP_DIR = "foundry-drops";

/**
 * The window has native file drops off (so in-app drag and drop works), which
 * means a dropped file arrives without a path. Stage its bytes under app data so
 * the backend can read it like a picked file.
 */
export const stageDroppedFile = async (file: File): Promise<string> => {
  await mkdir(DROP_DIR, {
    baseDir: BaseDirectory.AppLocalData,
    recursive: true,
  });
  const name = `${crypto.randomUUID()}-${file.name}`;
  const relative = `${DROP_DIR}/${name}`;
  await writeFile(relative, new Uint8Array(await file.arrayBuffer()), {
    baseDir: BaseDirectory.AppLocalData,
  });
  return join(await appLocalDataDir(), DROP_DIR, name);
};

export const extensionOf = (name: string) =>
  name.split(".").pop()?.toLowerCase() ?? "";

/**
 * Drop a file here or click to pick one. Hands the file's path to `onFile`,
 * either straight from the picker or staged from a drop.
 */
export const FoundryDropZone = ({
  title,
  extensions,
  dialogTitle,
  disabled,
  icon,
  onFile,
  className,
}: {
  title: string;
  extensions: string[];
  dialogTitle: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  onFile: (path: string) => void | Promise<void>;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);

  const pick = useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      title: dialogTitle,
      filters: [{ name: title, extensions }],
    });
    if (selected) await onFile(selected);
  }, [dialogTitle, extensions, onFile, title]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setOver(false);
      const file = event.dataTransfer.files[0];
      if (!file || disabled) return;
      if (!extensions.includes(extensionOf(file.name))) return;
      await onFile(await stageDroppedFile(file));
    },
    [disabled, extensions, onFile],
  );

  return (
    <button
      className={cn(
        "flex w-full flex-col items-center gap-1.5 rounded-lg border bg-background px-3 py-4 text-center transition-colors",
        over
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/30 hover:border-muted-foreground/60",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      disabled={disabled}
      onClick={pick}
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={onDrop}
      type='button'>
      {icon ?? (
        <UploadSimpleIcon className='h-[18px] w-[18px] text-muted-foreground' />
      )}
      <span className='font-medium text-xs'>{title}</span>
      <span className='font-medium text-[11px] text-secondary-foreground'>
        {t("foundry.drop.choose")}
      </span>
    </button>
  );
};
