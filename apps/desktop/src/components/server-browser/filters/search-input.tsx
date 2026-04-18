import { Input } from "@deadlock-mods/ui/components/input";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ServerCountBadge from "./server-count-badge";

interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  total: number;
  isFetching?: boolean;
}

const SearchInput = ({
  value,
  onChange,
  total,
  isFetching,
}: SearchInputProps) => {
  const { t } = useTranslation();
  return (
    <div className='relative flex min-w-[260px] flex-1'>
      <MagnifyingGlassIcon
        aria-hidden
        className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
      />
      <Input
        aria-label={t("servers.searchPlaceholder")}
        className={cn(
          "h-9 border-border/60 bg-background/40 pl-8 pr-32",
          "placeholder:text-muted-foreground/70",
          "focus-visible:border-primary/50 focus-visible:ring-primary/30",
        )}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("servers.searchPlaceholder")}
        type='text'
        value={value}
      />
      <div className='pointer-events-auto absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1'>
        {value && (
          <button
            aria-label={t("servers.filters.chip.remove")}
            className='inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground'
            onClick={() => onChange("")}
            type='button'>
            <XIcon className='size-3.5' weight='bold' />
          </button>
        )}
        <ServerCountBadge isFetching={isFetching} total={total} />
      </div>
    </div>
  );
};

export default SearchInput;
