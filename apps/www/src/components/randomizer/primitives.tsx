import type { ItemCategory } from "@/lib/deadlock-assets";
import { cn } from "@/lib/utils";

export const CATEGORY_TEXT: Record<ItemCategory, string> = {
  weapon: "text-dl-weapon",
  vitality: "text-dl-vitality",
  spirit: "text-dl-spirit",
};

export const CATEGORY_BORDER: Record<ItemCategory, string> = {
  weapon: "border-dl-weapon/30",
  vitality: "border-dl-vitality/30",
  spirit: "border-dl-spirit/30",
};

export const CATEGORY_TINT: Record<ItemCategory, string> = {
  weapon: "bg-dl-weapon/10",
  vitality: "bg-dl-vitality/10",
  spirit: "bg-dl-spirit/10",
};

export const CATEGORY_BAR: Record<ItemCategory, string> = {
  weapon: "bg-dl-weapon",
  vitality: "bg-dl-vitality",
  spirit: "bg-dl-spirit",
};

export const formatSouls = (souls: number): string =>
  souls.toLocaleString("en-US");

/** Shop descriptions ship with Panorama markup the page has no use for. */
export const stripMarkup = (value: string | undefined): string => {
  if (!value) return "";

  let sanitized = value;
  let previous: string;
  do {
    previous = sanitized;
    sanitized = sanitized.replaceAll(/<[^>]*>/g, "");
  } while (sanitized !== previous);

  return sanitized.replaceAll(/\s+/g, " ").trim();
};

export const MicroLabel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("dl-label text-muted-foreground/70", className)}>
    {children}
  </div>
);

export const Panel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "dl-notch border border-[rgb(var(--hero)/0.18)] bg-background-dark/70 backdrop-blur-sm",
      className,
    )}>
    {children}
  </div>
);

export const SectionHeading = ({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) => (
  <div className='mb-4 flex flex-wrap items-end justify-between gap-2 border-[rgb(var(--hero)/0.25)] border-t pt-5'>
    <h2 className='font-primary font-bold text-3xl text-dl-offwhite'>
      {title}
    </h2>
    {aside ? (
      <div className='text-muted-foreground text-xs'>{aside}</div>
    ) : null}
  </div>
);

export const TierPips = ({
  tier,
  category,
  max = 4,
}: {
  tier: number;
  category: ItemCategory;
  max?: number;
}) => (
  <div className='flex gap-0.5' title={`Tier ${tier}`}>
    {Array.from({ length: max }, (_, index) => (
      <span
        key={index}
        className={cn(
          "h-0.5 w-2 rounded-full",
          index < tier ? CATEGORY_BAR[category] : "bg-muted-foreground/25",
        )}
      />
    ))}
  </div>
);
