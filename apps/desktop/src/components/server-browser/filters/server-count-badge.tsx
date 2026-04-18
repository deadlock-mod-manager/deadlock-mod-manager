import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ServerCountBadgeProps {
  total: number;
  isFetching?: boolean;
}

const ServerCountBadge = ({ total, isFetching }: ServerCountBadgeProps) => {
  const { t } = useTranslation();
  const label = t("servers.filters.count", { count: total });
  return (
    <span
      aria-live='polite'
      className={cn(
        "pointer-events-none inline-flex select-none items-center gap-1.5",
        "rounded-md border border-border/50 bg-background/60 px-2 py-0.5",
        "text-[11px] font-medium text-muted-foreground",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
      )}
      title={label}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full transition-colors",
          isFetching
            ? "bg-amber-400/80 animate-pulse"
            : total > 0
              ? "bg-emerald-400/80"
              : "bg-muted-foreground/50",
        )}
      />
      <span className='tabular-nums text-foreground/80'>
        {total.toLocaleString()}
      </span>
    </span>
  );
};

export default ServerCountBadge;
