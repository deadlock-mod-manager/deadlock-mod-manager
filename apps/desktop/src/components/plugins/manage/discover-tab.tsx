import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { CaretUpDownIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CatalogCard } from "@/components/plugins/manage/catalog-card";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { PluginSwitch } from "@/components/plugins/manage/plugin-switch";
import { useNow } from "@/components/plugins/plugin-format";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import {
  CATALOG_CATEGORIES,
  type CatalogCategory,
  type CatalogEntry,
  PLUGIN_CATALOG,
} from "@/lib/plugins/catalog";
import { cn } from "@/lib/utils";

const SORTS = ["installs", "updated", "name"] as const;

type Sort = (typeof SORTS)[number];

const COMPARE = {
  installs: (a, b) => (b.installs ?? 0) - (a.installs ?? 0),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  name: (a, b) => a.name.localeCompare(b.name),
} satisfies Record<Sort, (a: CatalogEntry, b: CatalogEntry) => number>;

const ROW_SIZE = 3;

type DiscoverTabProps = {
  query: string;
  installedIds: Set<string>;
};

export const DiscoverTab = ({ query, installedIds }: DiscoverTabProps) => {
  const { t } = useTranslation();
  const now = useNow(60_000);
  const [category, setCategory] = useState<CatalogCategory | "all">("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("installs");

  const needle = query.trim().toLowerCase();
  const entries = PLUGIN_CATALOG.filter(
    (entry) =>
      (category === "all" || entry.category === category) &&
      (!verifiedOnly || entry.verified) &&
      (!needle ||
        [
          entry.name,
          entry.author,
          t(`plugins.catalog.${entry.copyKey}.description`),
        ].some((text) => text.toLowerCase().includes(needle))),
  ).sort(COMPARE[sort]);
  const rows = Array.from(
    { length: Math.ceil(entries.length / ROW_SIZE) },
    (_, index) => entries.slice(index * ROW_SIZE, (index + 1) * ROW_SIZE),
  );

  const pill = (value: CatalogCategory | "all", label: string) => (
    <button
      aria-pressed={category === value}
      className={cn(
        "rounded-[99px] px-[12px] py-[5px] font-semibold text-[12px] leading-[normal] transition-colors",
        INSET_OUTLINE,
        category === value
          ? "bg-primary text-primary-foreground outline-primary"
          : "text-muted-foreground outline-border hover:text-foreground",
      )}
      key={value}
      onClick={() => setCategory(value)}
      type='button'>
      {label}
    </button>
  );

  return (
    <>
      <div className='flex w-full shrink-0 items-center gap-[6px]'>
        {pill("all", t("plugins.discover.categories.all"))}
        {CATALOG_CATEGORIES.map((value) =>
          pill(value, t(`plugins.discover.categories.${value}`)),
        )}
        <span className='h-px flex-1' />
        <label className='flex items-center gap-[8px] pr-[8px]'>
          <span className='text-muted-foreground text-[12px] leading-[normal]'>
            {t("plugins.discover.verifiedOnly")}
          </span>
          <PluginSwitch
            checked={verifiedOnly}
            onCheckedChange={setVerifiedOnly}
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("plugins.discover.sort.label")}
              className={cn(
                "flex h-[32px] w-[160px] items-center justify-between rounded-[6px] bg-background px-[10px] outline-border",
                INSET_OUTLINE,
              )}
              type='button'>
              <span className='text-[13px] text-foreground leading-[normal]'>
                {t(`plugins.discover.sort.${sort}`)}
              </span>
              <CaretUpDownIcon className='text-muted-foreground' size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-[160px]'>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                const next = SORTS.find((option) => option === value);
                if (next) setSort(next);
              }}
              value={sort}>
              {SORTS.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  {t(`plugins.discover.sort.${option}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {entries.length === 0 ? (
        <p className='w-full py-[24px] text-center text-muted-foreground text-[13px] leading-[normal]'>
          {t("plugins.discover.empty")}
        </p>
      ) : (
        <div className='flex w-full shrink-0 flex-col gap-[14px]'>
          {rows.map((row) => (
            <div className='flex w-full gap-[14px]' key={row[0].id}>
              {row.map((entry) => (
                <CatalogCard
                  entry={entry}
                  installed={installedIds.has(entry.id)}
                  key={entry.id}
                  now={now}
                />
              ))}
              {Array.from({ length: ROW_SIZE - row.length }, (_, index) => (
                <div className='min-w-0 flex-1' key={`spacer-${index}`} />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className='mt-auto flex w-full shrink-0 items-center gap-[10px] border-border border-t pt-[14px]'>
        <ShieldCheckIcon className='shrink-0' color={TONE_COLOR.ok} size={15} />
        <span className='text-muted-foreground text-[12px] leading-[normal]'>
          {t("plugins.discover.trust")}
        </span>
      </div>
    </>
  );
};
