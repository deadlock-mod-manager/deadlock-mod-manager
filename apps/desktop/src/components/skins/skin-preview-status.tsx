import { Button } from "@deadlock-mods/ui/components/button";
import { Check, Shuffle } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * How the skin in the 3D panel relates to what the hero wears. While the
 * randomizer owns the hero, what is on stays a surprise, so the panel only
 * says whether the skin can come up.
 */
export type SkinPreviewStatus =
  | "equipped"
  | "notEquipped"
  | "inPool"
  | "notInPool";

interface SkinPreviewStatusRowProps {
  status: SkinPreviewStatus;
  onWear: () => void;
  wearDisabled: boolean;
}

const chipClass =
  "inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 font-medium text-xs";

export const SkinPreviewStatusRow = ({
  status,
  onWear,
  wearDisabled,
}: SkinPreviewStatusRowProps) => {
  const { t } = useTranslation();

  switch (status) {
    case "equipped":
      return (
        <span
          className={cn(
            chipClass,
            "self-start bg-primary/[0.12] text-primary",
          )}>
          <Check className='h-3 w-3' strokeWidth={3} />
          {t("skins.equipped")}
        </span>
      );
    case "notEquipped":
      return (
        <div className='flex items-center justify-between gap-2 pr-2'>
          <span className={cn(chipClass, "bg-muted text-muted-foreground")}>
            {t("skins.preview.notEquipped")}
          </span>
          <Button
            className='h-7 px-2.5'
            disabled={wearDisabled}
            onClick={onWear}
            size='sm'>
            {t("skins.preview.wear")}
          </Button>
        </div>
      );
    case "inPool":
      return (
        <span
          className={cn(
            chipClass,
            "self-start bg-secondary-foreground/[0.12] text-secondary-foreground",
          )}>
          <Shuffle className='h-3 w-3' />
          {t("skins.randomizer.poolMember")}
        </span>
      );
    case "notInPool":
      return (
        <span
          className={cn(
            chipClass,
            "self-start bg-muted text-muted-foreground",
          )}>
          <Shuffle className='h-3 w-3' />
          {t("skins.randomizer.notPoolMember")}
        </span>
      );
  }
};
