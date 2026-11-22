import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { File as FileIcon, Info, Plus, X } from "@deadlock-mods/ui/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getModCategoryDisplayName } from "@/lib/constants";
import { getFileBaseName } from "@/lib/file-utils";
import { partContentsFor, suggestCategory } from "@/lib/local-mod-contents";
import type { LocalPartContents } from "@/types/generated/LocalPartContents";

export type ImportMode = "one" | "separate";

interface ModPartsListProps {
  files: File[];
  contents?: LocalPartContents[];
  mode: ImportMode;
  disabled?: boolean;
  onModeChange: (mode: ImportMode) => void;
  onAdd: () => void;
  onRemove: (file: File) => void;
}

const byInstallOrder = (a: File, b: File) => {
  const left = getFileBaseName(a);
  const right = getFileBaseName(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const contentTags = (part: LocalPartContents, t: TFunction): string[] => {
  const tags: string[] = [];
  for (const name of part.mapNames) {
    tags.push(t("addMods.contents.map", { name }));
  }
  const counted = [
    ["models", part.models],
    ["particles", part.particles],
    ["voiceLines", part.voiceLines],
    ["abilitySounds", part.abilitySounds],
    ["weaponSounds", part.weaponSounds],
    ["sounds", part.otherSounds],
  ] as const;
  for (const [key, count] of counted) {
    if (count > 0) tags.push(t(`addMods.contents.${key}`, { count }));
  }
  if (part.hudFiles > 0 && !part.reskinsHero) {
    tags.push(t("addMods.contents.hud"));
  }
  return tags;
};

export const ModPartsList = ({
  files,
  contents,
  mode,
  disabled = false,
  onModeChange,
  onAdd,
  onRemove,
}: ModPartsListProps) => {
  const { t } = useTranslation();
  const ordered = [...files].sort(byInstallOrder);
  const separate = mode === "separate";

  return (
    <section className='space-y-2' data-testid='mod-parts'>
      <div className='flex items-center gap-2'>
        <h3 className='font-medium text-sm'>
          {separate ? t("common.mods") : t("addMods.parts")}
        </h3>
        <span className='flex-1 text-muted-foreground text-xs tabular-nums'>
          {t("addMods.partsCount", { count: files.length })}
        </span>
        {files.length > 1 && (
          <ToggleGroup
            aria-label={t("addMods.importAs")}
            className='gap-0.5 rounded-md bg-muted/60 p-0.5'
            disabled={disabled}
            onValueChange={(value) => {
              if (value === "one" || value === "separate") onModeChange(value);
            }}
            size='sm'
            type='single'
            value={mode}>
            {(["one", "separate"] as const).map((value) => (
              <ToggleGroupItem
                className='h-7 px-2.5 text-muted-foreground text-xs data-[state=on]:bg-secondary data-[state=on]:text-foreground'
                data-testid={`import-mode-${value}`}
                key={value}
                value={value}>
                {value === "one"
                  ? t("addMods.oneMod")
                  : t("addMods.separateMods")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
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
          const part = partContentsFor(contents, file);
          const category = separate && part ? suggestCategory([part]) : null;
          return (
            <li
              className='flex items-center gap-3 px-3 py-2'
              data-part-name={name}
              key={name}>
              {!separate && (
                <span className='w-4 text-muted-foreground text-xs tabular-nums'>
                  {index + 1}
                </span>
              )}
              <FileIcon className='h-4 w-4 shrink-0 text-muted-foreground' />
              <span className='min-w-0 flex-1 truncate font-mono text-sm'>
                {name}
              </span>
              {part && !part.readable && (
                <Badge variant='destructive'>
                  {t("addMods.contents.unreadable")}
                </Badge>
              )}
              {category && (
                <Badge variant='outline'>
                  {getModCategoryDisplayName(category)}
                </Badge>
              )}
              {part?.hero && <Badge variant='outline'>{part.hero}</Badge>}
              {part &&
                contentTags(part, t)
                  .slice(0, category ? 2 : 3)
                  .map((tag) => (
                    <Badge
                      className='border-transparent bg-muted font-normal text-muted-foreground'
                      key={tag}
                      variant='outline'>
                      {tag}
                    </Badge>
                  ))}
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
      {files.length > 1 && (
        <p className='flex items-start gap-2 text-muted-foreground text-xs'>
          <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          {separate ? t("addMods.separateHint") : t("addMods.partsHint")}
        </p>
      )}
    </section>
  );
};
