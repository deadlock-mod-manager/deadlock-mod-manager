import { Button } from "@deadlock-mods/ui/components/button";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { ChevronDown, Shield } from "@deadlock-mods/ui/icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { RankAsset } from "@/lib/stats/api";
import type { RankRange } from "@/lib/stats/party";

interface RankRangePickerProps {
  range: RankRange;
  rankAssets: RankAsset[];
  onChange: (range: RankRange) => void;
}

/** Which ranks the party's stats come from, as a from-to pair of tiers. */
export const RankRangePicker = ({
  range,
  rankAssets,
  onChange,
}: RankRangePickerProps) => {
  const { t } = useTranslation();
  const id = useId();
  const tiers = [...rankAssets].sort((a, b) => a.tier - b.tier);
  const lowest = tiers[0]?.tier ?? 0;
  const highest = tiers.at(-1)?.tier ?? 0;
  const nameOf = (tier: number) =>
    tiers.find((asset) => asset.tier === tier)?.name ?? String(tier);
  const minTier = range?.minTier ?? lowest;
  const maxTier = range?.maxTier ?? highest;

  // Spanning every tier is the same request as no filter, so it is stored as one.
  const update = (from: number, to: number) =>
    onChange(
      from <= lowest && to >= highest
        ? null
        : { minTier: Math.min(from, to), maxTier: Math.max(from, to) },
    );

  const tierSelect = (
    label: string,
    value: number,
    onValue: (tier: number) => void,
  ) => (
    <div className='flex flex-col gap-1.5'>
      <Label className='text-xs' htmlFor={`${id}-${label}`}>
        {label}
      </Label>
      <Select
        onValueChange={(next) => onValue(Number(next))}
        value={String(value)}>
        <SelectTrigger className='h-9' id={`${id}-${label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tiers.map((asset) => (
            <SelectItem key={asset.tier} value={String(asset.tier)}>
              {asset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("stats.party.rank.label")}
          className='h-8 gap-2 rounded-lg px-3 font-semibold text-[12.5px] data-[state=open]:bg-secondary'
          disabled={tiers.length === 0}
          size='sm'
          variant='outline'>
          <Shield aria-hidden className='h-3.5 w-3.5 text-muted-foreground' />
          {range
            ? t("stats.party.rank.range", {
                from: nameOf(range.minTier),
                to: nameOf(range.maxTier),
              })
            : t("stats.party.rank.all")}
          <ChevronDown
            aria-hidden
            className='h-3.5 w-3.5 text-muted-foreground'
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 space-y-3 p-3'>
        <div className='grid grid-cols-2 gap-2'>
          {tierSelect(t("stats.party.rank.from"), minTier, (tier) =>
            update(tier, maxTier),
          )}
          {tierSelect(t("stats.party.rank.to"), maxTier, (tier) =>
            update(minTier, tier),
          )}
        </div>
        {range && (
          <Button
            className='h-7 w-full text-xs'
            onClick={() => onChange(null)}
            size='sm'
            variant='ghost'>
            {t("stats.party.rank.all")}
          </Button>
        )}
        <p className='border-border/60 border-t pt-3 text-muted-foreground text-xs leading-relaxed'>
          {t("stats.party.rank.hint")}
        </p>
      </PopoverContent>
    </Popover>
  );
};
