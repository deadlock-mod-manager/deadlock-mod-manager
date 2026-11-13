import { Button } from "@deadlock-mods/ui/components/button";
import { File as FileIcon, Info, Plus, X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { getFileBaseName } from "@/lib/file-utils";

interface ModPartsListProps {
  files: File[];
  disabled?: boolean;
  onAdd: () => void;
  onRemove: (file: File) => void;
}

// Code-point order, as the backend sorts the paths it installs.
const byInstallOrder = (a: File, b: File) => {
  const left = getFileBaseName(a);
  const right = getFileBaseName(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

/** The VPKs a custom mod is imported from, each a part Manage files can turn off. */
export const ModPartsList = ({
  files,
  disabled = false,
  onAdd,
  onRemove,
}: ModPartsListProps) => {
  const { t } = useTranslation();
  const ordered = [...files].sort(byInstallOrder);

  return (
    <section className='space-y-2' data-testid='mod-parts'>
      <div className='flex items-center gap-2'>
        <h3 className='font-medium text-sm'>{t("addMods.parts")}</h3>
        <span className='flex-1 text-muted-foreground text-xs tabular-nums'>
          {t("addMods.partsCount", { count: files.length })}
        </span>
        <Button
          disabled={disabled}
          icon={<Plus className='h-3.5 w-3.5' />}
          onClick={onAdd}
          size='sm'
          type='button'
          variant='outline'>
          {t("addMods.addFiles")}
        </Button>
      </div>
      <ol className='divide-y rounded-md border bg-card'>
        {ordered.map((file, index) => {
          const name = getFileBaseName(file);
          return (
            <li
              className='flex items-center gap-3 px-3 py-2'
              data-part-name={name}
              key={name}>
              <span className='w-4 text-muted-foreground text-xs tabular-nums'>
                {index + 1}
              </span>
              <FileIcon className='h-4 w-4 shrink-0 text-muted-foreground' />
              <span className='min-w-0 flex-1 truncate font-mono text-sm'>
                {name}
              </span>
              <Button
                aria-label={t("addMods.removePart", { name })}
                className='h-7 w-7'
                disabled={disabled || files.length === 1}
                icon={<X className='h-3.5 w-3.5' />}
                onClick={() => onRemove(file)}
                size='icon'
                type='button'
                variant='ghost'
              />
            </li>
          );
        })}
      </ol>
      <p className='flex items-start gap-2 text-muted-foreground text-xs'>
        <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
        {t("addMods.partsHint")}
      </p>
    </section>
  );
};
