import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { GlobeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FlagGlyph } from "../region-flag";
import type { ContinentKey } from "./region-grouping";
import { ANY } from "./types";

interface RegionSelectProps {
  value: string;
  onChange: (next: string) => void;
  groupedRegions: ReadonlyArray<readonly [ContinentKey, string[]]>;
}

const RegionSelect = ({
  value,
  onChange,
  groupedRegions,
}: RegionSelectProps) => {
  const { t } = useTranslation();
  return (
    <Select
      onValueChange={(v) => onChange(v === ANY ? "" : v)}
      value={value || ANY}>
      <SelectTrigger
        className={cn(
          "h-9 w-40 gap-1.5 border-border/60 bg-background/40 pr-2",
          "text-xs font-medium",
          "data-[state=open]:border-primary/40",
        )}>
        <SelectValue placeholder={t("servers.filters.anyRegion")}>
          {value ? (
            <span className='inline-flex items-center gap-2'>
              <FlagGlyph className='size-3.5' region={value} />
              <span>{value.toUpperCase()}</span>
            </span>
          ) : (
            <span className='inline-flex items-center gap-2 text-muted-foreground'>
              <GlobeIcon className='size-3.5' />
              <span>{t("servers.filters.anyRegion")}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>
          <span className='inline-flex items-center gap-2'>
            <GlobeIcon className='size-3.5 text-muted-foreground' />
            <span className='text-xs'>{t("servers.filters.anyRegion")}</span>
          </span>
        </SelectItem>
        {groupedRegions.map(([key, regions]) => (
          <SelectGroup key={key}>
            <SelectSeparator />
            <SelectLabel
              className={cn(
                "px-2 py-1 text-[11px] font-semibold",
                "text-muted-foreground",
              )}>
              {t(`servers.filters.regionGroup.${key}`)}
            </SelectLabel>
            {regions.map((region) => (
              <SelectItem key={region} value={region}>
                <span className='inline-flex items-center gap-2'>
                  <FlagGlyph className='size-3.5' region={region} />
                  <span className='text-xs font-medium'>
                    {region.toUpperCase()}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};

export default RegionSelect;
