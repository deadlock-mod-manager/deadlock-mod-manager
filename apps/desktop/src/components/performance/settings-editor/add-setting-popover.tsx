import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@deadlock-mods/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchConvars } from "@/lib/performance/api";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { pathKey } from "@/lib/performance/request";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";

const SEARCH_DEBOUNCE_MS = 200;

type AddSettingPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  /** Path keys of entries already in the config. */
  configKeys: ReadonlySet<string>;
  onPick: (meta: ConvarMeta) => void;
};

const useUnavailableReason = () => {
  const { t } = useTranslation();
  return (meta: ConvarMeta): string | null => {
    switch (meta.status) {
      case "blocked":
        return meta.statusSinceBuild
          ? t("performance.editor.add.blockedSince", {
              build: meta.statusSinceBuild,
            })
          : t("performance.editor.add.blocked");
      case "removed":
        return t("performance.editor.add.removed");
      case "notConvar":
        return t("performance.editor.add.notConvar");
      default:
        return null;
    }
  };
};

const ConvarSearch = ({
  initialQuery,
  configKeys,
  onPick,
}: Omit<AddSettingPopoverProps, "open" | "onOpenChange">) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const unavailableReason = useUnavailableReason();
  const search = useQuery({
    queryKey: perfQueryKeys.convarSearch(debouncedQuery),
    queryFn: () => searchConvars(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 5 * 60 * 1000,
  });

  const renderBody = () => {
    if (debouncedQuery.length === 0) {
      return (
        <p className='px-3 py-6 text-center text-muted-foreground text-sm'>
          {t("performance.editor.add.hint")}
        </p>
      );
    }
    if (search.isError) {
      return (
        <p className='px-3 py-6 text-center text-destructive text-sm'>
          {t("performance.editor.add.error")}
        </p>
      );
    }
    if (!search.data) {
      return (
        <p className='px-3 py-6 text-center text-muted-foreground text-sm'>
          {t("performance.editor.add.loading")}
        </p>
      );
    }
    return (
      <>
        <CommandEmpty>{t("performance.editor.add.empty")}</CommandEmpty>
        {search.data.map((meta) => {
          const reason = unavailableReason(meta);
          const inConfig = configKeys.has(pathKey(["ConVars", meta.name]));
          return (
            <CommandItem
              className='items-start gap-3 py-2'
              disabled={reason !== null}
              key={meta.name}
              onSelect={() => onPick(meta)}
              value={meta.name}>
              <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span className='truncate font-mono text-xs'>
                    {meta.name}
                  </span>
                  {inConfig && (
                    <Badge
                      className='px-1.5 py-0 font-normal text-[11px]'
                      variant='secondary'>
                      {t("performance.editor.add.inConfig")}
                    </Badge>
                  )}
                </div>
                {meta.label && (
                  <span className='truncate text-muted-foreground text-xs'>
                    {meta.label}
                  </span>
                )}
                {reason && (
                  <span className='text-amber-400 text-xs'>{reason}</span>
                )}
              </div>
              <div className='flex shrink-0 flex-col items-end gap-1'>
                <Badge
                  className='px-1.5 py-0 font-normal text-[11px]'
                  variant='outline'>
                  {t(`performance.editor.add.kinds.${meta.kind}`)}
                </Badge>
                <span className='max-w-32 truncate font-mono text-[11px] text-muted-foreground'>
                  {meta.default === null
                    ? t("performance.editor.add.noDefault")
                    : t("performance.editor.add.default", {
                        value: meta.default,
                      })}
                </span>
              </div>
            </CommandItem>
          );
        })}
      </>
    );
  };

  return (
    <Command shouldFilter={false}>
      <CommandInput
        autoFocus
        onValueChange={setQuery}
        placeholder={t("performance.editor.add.placeholder")}
        value={query}
      />
      <CommandList className='max-h-[360px]'>{renderBody()}</CommandList>
    </Command>
  );
};

/** Search every convar the catalog knows and add one to the config. */
export const AddSettingPopover = ({
  open,
  onOpenChange,
  ...searchProps
}: AddSettingPopoverProps) => {
  const { t } = useTranslation();
  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button size='sm' variant='outline'>
          <PlusIcon />
          {t("performance.editor.toolbar.addSetting")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-[26rem] p-0'>
        <ConvarSearch {...searchProps} />
      </PopoverContent>
    </Popover>
  );
};
