import { Card } from "@deadlock-mods/ui/components/card";
import { Check, Lock, Shuffle } from "@deadlock-mods/ui/icons";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Wearing skins, or picking the ones the randomizer shuffles between. */
type SkinCardMode = "wear" | "pool";

export interface SkinCardState {
  mode: SkinCardMode;
  /** Installed now. False while the randomizer keeps the rolled skin a surprise. */
  isEquipped: boolean;
  inPool: boolean;
  /** False for a skin that cannot be put on at launch without a dialog. */
  canPool: boolean;
  /** A swap is running, so wearing has to wait. */
  disabled: boolean;
}

interface SkinCardShellProps extends SkinCardState {
  onWear: () => void;
  /** Required in pool mode; a card that only wears can leave it out. */
  onTogglePool?: () => void;
  /** The image area. Badges and hover actions sit on top of it. */
  media: ReactNode;
  hoverActions?: ReactNode;
  children: ReactNode;
}

/**
 * The frame both skin cards share. A click wears the skin, or in pool mode
 * ticks it in or out of the shuffle pool, so the card is a button or a
 * checkbox depending on the mode.
 */
export const SkinCardShell = ({
  mode,
  isEquipped,
  inPool,
  canPool,
  disabled,
  onWear,
  onTogglePool,
  media,
  hoverActions,
  children,
}: SkinCardShellProps) => {
  const { t } = useTranslation();
  const pooling = mode === "pool";
  const inert = pooling ? !canPool : disabled;
  const leftOut = pooling && !inPool;

  const activate = () => {
    if (inert) {
      return;
    }
    if (pooling) {
      onTogglePool?.();
    } else {
      onWear();
    }
  };

  return (
    <Card
      aria-checked={pooling ? inPool : undefined}
      aria-disabled={inert}
      aria-pressed={pooling ? undefined : isEquipped}
      className={cn(
        "group/skin relative cursor-pointer overflow-hidden shadow-none transition-[border-color,box-shadow,background-color] ease-dmm-smooth",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        !pooling && "hover:border-primary/50",
        !pooling &&
          isEquipped &&
          "border-primary shadow-[0_10px_30px_-14px_hsl(var(--primary)/0.45)] ring-1 ring-primary hover:border-primary",
        pooling &&
          inPool &&
          "border-secondary-foreground/60 bg-secondary-foreground/[0.07]",
        pooling && canPool && !inPool && "hover:border-secondary-foreground/40",
        inert && "cursor-default",
        !pooling && disabled && "opacity-60",
      )}
      onClick={activate}
      onKeyDown={(e) => {
        // Guard on the card itself so Enter on a nested control does not also
        // wear the skin.
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          activate();
        }
      }}
      role={pooling ? "checkbox" : "button"}
      tabIndex={inert ? -1 : 0}>
      <div className='relative h-32 overflow-hidden bg-muted'>
        <div
          className={cn(
            "h-full w-full transition-[filter] ease-dmm-smooth",
            leftOut && "brightness-50 grayscale-[0.7]",
          )}>
          {media}
        </div>
        {pooling ? (
          <span
            aria-hidden='true'
            className={cn(
              "absolute top-2 left-2 z-10 flex size-[22px] items-center justify-center rounded-md",
              inPool
                ? "bg-secondary-foreground text-primary-foreground"
                : "bg-background/75 shadow-[inset_0_0_0_1.5px_hsl(var(--foreground)/0.4)]",
              !canPool &&
                "text-muted-foreground shadow-[inset_0_0_0_1.5px_hsl(var(--foreground)/0.15)]",
            )}>
            {inPool && <Check className='h-3.5 w-3.5' strokeWidth={3} />}
            {!canPool && <Lock className='h-3 w-3' />}
          </span>
        ) : (
          isEquipped && (
            <span className='absolute top-2 left-2 z-10 flex h-[22px] items-center gap-1 rounded-md bg-primary px-2 font-semibold text-[11px] text-primary-foreground'>
              <Check className='h-3 w-3' strokeWidth={3} />
              {t("skins.equipped")}
            </span>
          )
        )}
        {!pooling && inPool && (
          <span
            className='absolute right-2 bottom-2 z-10 flex size-[22px] items-center justify-center rounded-md bg-background/80 text-secondary-foreground backdrop-blur-sm'
            role='img'
            aria-label={t("skins.randomizer.poolMember")}
            title={t("skins.randomizer.poolMember")}>
            <Shuffle className='h-3 w-3' />
          </span>
        )}
        <div className='absolute top-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/skin:opacity-100 group-focus-within/skin:opacity-100 has-[[data-state=open]]:opacity-100'>
          {hoverActions}
        </div>
      </div>
      <div
        className={cn(
          "flex min-h-[54px] items-center gap-2 py-2 pr-2 pl-3 transition-opacity",
          leftOut && "opacity-60",
        )}>
        {children}
      </div>
    </Card>
  );
};
