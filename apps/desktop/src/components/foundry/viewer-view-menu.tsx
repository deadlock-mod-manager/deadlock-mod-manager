import { Button } from "@deadlock-mods/ui/components/button";
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
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ApertureIcon,
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CubeIcon,
  CubeTransparentIcon,
  type Icon,
  PenNibIcon,
  SlidersHorizontalIcon,
  StairsIcon,
  SunHorizonIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { MeshGroupTable } from "./viewer-mesh-groups";
import {
  type ViewerLook,
  type ViewerOverlayToggle,
  overlaySurface,
  DEFAULT_LOOK,
} from "./viewer-tool-types";
import { MenuSection } from "./viewer-menu-section";
import { SwitchRow } from "./viewer-switch-row";

export interface ViewerBodyGroups {
  table: MeshGroupTable;
  chosen: Record<string, number>;
  onChange: (chosen: Record<string, number>) => void;
}

export const ViewerViewMenu = ({
  look,
  onChange,
  overlays,
  bodyGroups,
}: {
  look: ViewerLook;
  onChange: (look: ViewerLook) => void;
  overlays: ViewerOverlayToggle[];
  bodyGroups?: ViewerBodyGroups | null;
}) => {
  const { t } = useTranslation();
  const passes: {
    key: "bloom" | "outlines" | "antialias" | "wireframe";
    icon: Icon;
  }[] = [
    { key: "bloom", icon: SunHorizonIcon },
    { key: "outlines", icon: PenNibIcon },
    { key: "antialias", icon: StairsIcon },
    { key: "wireframe", icon: CubeTransparentIcon },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size='sm'
          variant='ghost'
          className={cn(
            overlaySurface,
            "group h-8 gap-1.5 px-2.5 text-xs data-[state=open]:border-primary/40",
          )}>
          <SlidersHorizontalIcon className='size-3.5' />
          {t("modelPreview.view")}
          <CaretDownIcon className='size-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' sideOffset={6} className='w-72 p-1.5'>
        <MenuSection title={t("modelPreview.renderSettings")}>
          {passes.map(({ key, icon }) => (
            <SwitchRow
              key={key}
              icon={icon}
              label={t(`modelPreview.${key}`)}
              checked={look[key]}
              onCheckedChange={(checked) =>
                onChange({ ...look, [key]: checked })
              }
            />
          ))}
          <div className='space-y-2.5 px-2 pt-2 pb-2.5'>
            <div className='flex items-center gap-2.5 text-xs'>
              <ApertureIcon className='size-3.5 text-muted-foreground' />
              <span className='flex-1'>{t("modelPreview.exposure")}</span>
              <span className='font-mono text-[11px] text-muted-foreground tabular-nums'>
                {look.exposure.toFixed(2)}
              </span>
            </div>
            <Slider
              aria-label={t("modelPreview.exposure")}
              min={0.25}
              max={2}
              step={0.05}
              value={[look.exposure]}
              onValueChange={([exposure]) =>
                exposure !== undefined && onChange({ ...look, exposure })
              }
            />
          </div>
        </MenuSection>
        {bodyGroups && (
          <>
            <Separator />
            <MenuSection title={t("modelPreview.bodyGroups")}>
              {bodyGroups.table.bodyGroups.map((group) => (
                <div
                  key={group.name}
                  className='flex h-8 items-center gap-2.5 px-2 text-xs'>
                  <CubeIcon className='size-3.5 shrink-0 text-muted-foreground' />
                  <span className='flex-1 truncate'>{group.name}</span>
                  <Select
                    value={String(bodyGroups.chosen[group.name])}
                    onValueChange={(value) =>
                      bodyGroups.onChange({
                        ...bodyGroups.chosen,
                        [group.name]: Number(value),
                      })
                    }>
                    <SelectTrigger
                      aria-label={group.name}
                      className='h-7 w-32 px-2 text-xs'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {group.choices.map((choice) => (
                        <SelectItem key={choice.bit} value={String(choice.bit)}>
                          {choice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </MenuSection>
          </>
        )}
        {overlays.length > 0 && (
          <>
            <Separator />
            <MenuSection title={t("modelPreview.overlays")}>
              {overlays.map(({ id, ...overlay }) => (
                <SwitchRow key={id} {...overlay} />
              ))}
            </MenuSection>
          </>
        )}
        <Separator />
        <button
          type='button'
          className='mt-1 flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
          disabled={(Object.keys(DEFAULT_LOOK) as (keyof ViewerLook)[]).every(
            (key) => look[key] === DEFAULT_LOOK[key],
          )}
          onClick={() => onChange(DEFAULT_LOOK)}>
          <ArrowCounterClockwiseIcon className='size-3.5' />
          {t("modelPreview.resetView")}
        </button>
      </PopoverContent>
    </Popover>
  );
};
