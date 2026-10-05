import { cn } from "@deadlock-mods/ui/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  size?: "lg" | "md";
  className?: string;
};

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className='font-medium text-[13px] text-muted-foreground'>{children}</p>
);

export const SectionHeading = ({
  eyebrow,
  title,
  description,
  size = "lg",
  className,
}: SectionHeadingProps) => (
  <div className={cn("max-w-3xl", className)}>
    {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
    <h2
      className={cn(
        "text-balance font-bold font-primary",
        eyebrow && "mt-2",
        size === "lg"
          ? "text-[clamp(36px,4.4vw,56px)] leading-[1.05]"
          : "text-[clamp(32px,3.6vw,46px)] leading-[1.08]",
      )}>
      {title}
    </h2>
    {description && (
      <p className='mt-4 max-w-[60ch] text-pretty text-base text-muted-foreground leading-relaxed'>
        {description}
      </p>
    )}
  </div>
);
