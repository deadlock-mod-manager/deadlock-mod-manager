import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { modeTone } from "../mode-tones";
import { formatModeLabel } from "./region-grouping";
import { ANY } from "./types";

interface GameModeSelectProps {
  value: string;
  onChange: (next: string) => void;
  modes: string[];
}

const GameModeSelect = ({ value, onChange, modes }: GameModeSelectProps) => {
  const { t } = useTranslation();
  return (
    <Select
      onValueChange={(v) => onChange(v === ANY ? "" : v)}
      value={value || ANY}>
      <SelectTrigger
        className={cn(
          "h-9 w-44 gap-1.5 border-border/60 bg-background/40 pr-2",
          "text-xs font-medium",
          "data-[state=open]:border-primary/40",
        )}>
        <SelectValue placeholder={t("servers.filters.anyGameMode")}>
          {value ? (
            <span className='inline-flex items-center gap-2'>
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  modeTone(value)?.dot ?? "bg-muted",
                )}
              />
              <span className='truncate'>{formatModeLabel(value)}</span>
            </span>
          ) : (
            <span className='text-muted-foreground'>
              {t("servers.filters.anyGameMode")}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>
          <span className='inline-flex items-center gap-2'>
            <span
              aria-hidden
              className='size-2 shrink-0 rounded-full bg-muted-foreground/40'
            />
            <span className='text-xs'>{t("servers.filters.anyGameMode")}</span>
          </span>
        </SelectItem>
        {modes.length > 0 && <SelectSeparator />}
        {modes.map((mode) => {
          const tone = modeTone(mode);
          return (
            <SelectItem key={mode} value={mode}>
              <span className='inline-flex items-center gap-2'>
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    tone?.dot ?? "bg-muted",
                  )}
                />
                <span className='text-xs'>{formatModeLabel(mode)}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default GameModeSelect;
