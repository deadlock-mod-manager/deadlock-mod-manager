import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  CaretUpDownIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadSimpleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  INSET_OUTLINE,
  PluginSwitch,
  RowButton,
} from "@/components/plugins/manage/plugin-row";
import { useInstallFromCatalog } from "@/components/plugins/manage/use-install-plugin";
import { formatRelativeTime, useNow } from "@/components/plugins/plugin-format";
import { PluginTile } from "@/components/plugins/plugin-identity";
import { describeAccess } from "@/components/plugins/plugin-permissions";
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

/** Install for published entries; a disabled button that says why otherwise. */
const InstallButton = ({
  entry,
  className,
  children,
}: {
  entry: CatalogEntry;
  className?: string;
  children?: ReactNode;
}) => {
  const { t } = useTranslation();
  const install = useInstallFromCatalog();
  const { archive } = entry;
  if (!archive) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='flex shrink-0' tabIndex={0}>
            <RowButton
              className={className}
              disabled
              icon={DownloadSimpleIcon}
              variant='primary'>
              {children ?? t("plugins.discover.install")}
            </RowButton>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("plugins.discover.notPublished")}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <RowButton
      className={className}
      disabled={install.isPending}
      icon={DownloadSimpleIcon}
      onClick={() => install.mutate(archive)}
      variant='primary'>
      {install.isPending
        ? t("plugins.discover.installing")
        : (children ?? t("plugins.discover.install"))}
    </RowButton>
  );
};

const formatInstalls = (t: TFunction, installs: number) =>
  installs < 1000
    ? String(installs)
    : t("plugins.discover.thousands", {
        value: (installs / 1000).toFixed(1).replace(/\.0$/, ""),
      });

const CatalogCard = ({
  entry,
  installed,
  now,
}: {
  entry: CatalogEntry;
  installed: boolean;
  now: number;
}) => {
  const { t, i18n } = useTranslation();
  return (
    <article
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-[12px] rounded-[12px] bg-card p-[16px] outline-[#FFFFFF0F]",
        INSET_OUTLINE,
      )}>
      <div className='flex w-full items-center gap-[12px]'>
        <PluginTile
          accent={entry.accent}
          fillAlpha='1A'
          glyphSize={21}
          icon={entry.icon}
          radius={10}
          size={42}
        />
        <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
          <span className='truncate font-semibold text-[14px] text-foreground leading-[normal]'>
            {entry.name}
          </span>
          <div className='flex items-center gap-[5px]'>
            <span className='truncate text-[#A3A3A3] text-[12px] leading-[normal]'>
              {t("plugins.discover.by", { author: entry.author })}
            </span>
            {entry.verified ? (
              <CheckCircleIcon
                aria-label={t("plugins.discover.verified")}
                className='shrink-0'
                color={TONE_COLOR.info}
                role='img'
                size={13}
              />
            ) : (
              <span className='rounded-[5px] bg-[#FBBF241A] px-[6px] py-[1px] font-semibold text-[#FBBF24] text-[10px] leading-[normal]'>
                {t("plugins.discover.unverified")}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className='w-full text-[#A3A3A3] text-[12px] leading-[17px]'>
        {t(`plugins.catalog.${entry.copyKey}.description`)}
      </p>
      <p className='w-full border-border border-t pt-[12px] text-[#A3A3A3] text-[12px] leading-[17px]'>
        {describeAccess(t, i18n.language, entry.permissions)}
      </p>
      <div className='mt-auto flex w-full items-center gap-[12px] pt-[4px]'>
        {entry.installs === undefined ? null : (
          <span className='flex items-center gap-[5px]'>
            <DownloadSimpleIcon color='#A3A3A3' size={13} />
            <span className='font-mono text-[#A3A3A3] text-[12px] leading-[normal]'>
              {formatInstalls(t, entry.installs)}
            </span>
          </span>
        )}
        <span className='flex items-center gap-[5px]'>
          <ClockIcon color='#A3A3A3' size={13} />
          <span className='text-[#A3A3A3] text-[12px] leading-[normal]'>
            {formatRelativeTime(t, entry.updatedAt, now)}
          </span>
        </span>
        <span className='h-px flex-1' />
        {installed ? (
          <span className='flex items-center gap-[5px] px-[4px] py-[6px]'>
            <CheckCircleIcon color={TONE_COLOR.ok} size={14} />
            <span className='font-semibold text-[#4ADE80] text-[13px] leading-[normal]'>
              {t("plugins.discover.installed")}
            </span>
          </span>
        ) : (
          <InstallButton entry={entry} />
        )}
      </div>
    </article>
  );
};

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
          : "text-[#A3A3A3] outline-[#262626] hover:text-foreground",
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
          <span className='text-[#A3A3A3] text-[12px] leading-[normal]'>
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
                "flex h-[32px] w-[160px] items-center justify-between rounded-[6px] bg-background px-[10px] outline-[#262626]",
                INSET_OUTLINE,
              )}
              type='button'>
              <span className='text-[13px] text-foreground leading-[normal]'>
                {t(`plugins.discover.sort.${sort}`)}
              </span>
              <CaretUpDownIcon color='#A3A3A3' size={12} />
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
        <p className='w-full py-[24px] text-center text-[#A3A3A3] text-[13px] leading-[normal]'>
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
        <span className='text-[#A3A3A3] text-[12px] leading-[normal]'>
          {t("plugins.discover.trust")}
        </span>
      </div>
    </>
  );
};
