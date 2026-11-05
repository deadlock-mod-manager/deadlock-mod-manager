import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useTranslation } from "react-i18next";
import { GameBananaLogo } from "@/components/shared/gamebanana-logo";
import { ModSourceGlyph } from "@/components/shared/mod-source-glyph";
import { useNativeSources } from "@/lib/mod-sources";
import { cn } from "@/lib/utils";

interface SourceSelectorProps {
  value: string;
  onChange: (sourceKey: string) => void;
  className?: string;
}

export const SourceSelector = ({
  value,
  onChange,
  className,
}: SourceSelectorProps) => {
  const { t } = useTranslation();
  const sources = useNativeSources();
  // The current source stays listed after it is disabled so the trigger keeps
  // its label while the catalog explains why it is unavailable.
  const choices =
    sources.data?.filter(
      (source) => !source.removed && (source.enabled || source.key === value),
    ) ?? [];
  if (choices.length === 0 && value === "gamebanana") return null;

  return (
    <>
      <span aria-hidden className='h-5 w-px bg-border/60' />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          aria-label={t("modSources.selectSource")}
          className={cn(
            "h-9 w-auto gap-2 border-transparent bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-accent/40 hover:text-foreground data-[state=open]:text-foreground",
            className,
          )}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align='end'>
          <SelectItem value='gamebanana'>
            <span className='flex items-center gap-2'>
              <GameBananaLogo />
              GameBanana
            </span>
          </SelectItem>
          {choices.map((source) => (
            <SelectItem key={source.key} value={source.key}>
              <span className='flex items-center gap-2'>
                <ModSourceGlyph iconUrl={source.descriptor.iconUrl} />
                {source.descriptor.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
};
