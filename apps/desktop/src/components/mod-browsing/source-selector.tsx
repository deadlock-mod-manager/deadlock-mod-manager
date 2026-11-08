import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Plus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { GameBananaLogo } from "@/components/shared/gamebanana-logo";
import { ModSourceGlyph } from "@/components/shared/mod-source-glyph";
import { useNativeSources } from "@/lib/mod-sources";
import { usePersistedStore } from "@/lib/store";
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
  const navigate = useNavigate();
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  const openSources = () => {
    markFeatureUsed("custom-mod-sources");
    navigate("/settings", { state: { activeTab: "mods" } });
  };
  // The current source stays listed after it is disabled so the trigger keeps
  // its label while the catalog explains why it is unavailable.
  const choices =
    sources.data?.filter(
      (source) => !source.removed && (source.enabled || source.key === value),
    ) ?? [];

  return (
    <>
      <span aria-hidden className='h-5 w-px bg-border/60' />
      <Select
        value={value}
        onValueChange={(sourceKey) => {
          if (sourceKey === "add-source") {
            openSources();
            return;
          }
          if (sourceKey !== "gamebanana") markFeatureUsed("custom-mod-sources");
          onChange(sourceKey);
        }}>
        <HintAnchor
          align='end'
          eligible={
            sources.isSuccess &&
            !sources.data.some((source) => !source.removed) &&
            value === "gamebanana"
          }
          hintId='custom-mod-sources'
          onShowMe={openSources}>
          <SelectTrigger
            aria-label={t("modSources.selectSource")}
            className={cn(
              "h-9 w-auto gap-2 border-transparent bg-transparent px-3 text-sm font-medium text-muted-foreground shadow-none focus:ring-0 hover:bg-accent/40 hover:text-foreground data-[state=open]:text-foreground",
              className,
            )}>
            <SelectValue />
          </SelectTrigger>
        </HintAnchor>
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
          <SelectSeparator />
          <SelectItem value='add-source'>
            <span className='flex items-center gap-2'>
              <Plus className='size-4 shrink-0' />
              {t("modSources.add")}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </>
  );
};
