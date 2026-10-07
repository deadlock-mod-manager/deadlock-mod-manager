import {
  Check,
  Crosshair,
  Dices,
  FileCode,
  type LucideIcon,
  Package,
  X,
} from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import Logo from "@/components/logo";
import { GITHUB_REPO } from "@/lib/constants";
import { useNumberFormat } from "@/lib/i18n/route";
import { getReleaseUrl } from "@/lib/release-downloads";
import { orpc } from "@/utils/orpc";
import { SectionHeading } from "./section-heading";
import { CtaArrow, secondaryCta } from "./cta";

const StatTile = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
}) => (
  <div className='rounded-xl border border-border bg-surface px-6 py-[22px]'>
    <dt className='text-[13px] text-muted-foreground'>{label}</dt>
    <dd className='mt-2.5 font-bold font-primary text-[44px] leading-none'>
      {value}
    </dd>
    <dd className='mt-2 text-[13px] text-muted-foreground'>{note}</dd>
  </div>
);

export const StatsSection = () => {
  const { t } = useTranslation("home");
  const compactNumber = useNumberFormat({
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const { data: stats } = useQuery(orpc.getStats.queryOptions());
  const { data: release } = useQuery(orpc.getVersion.queryOptions());
  const version = release?.version === "unknown" ? undefined : release?.version;

  return (
    <section
      aria-label={t("stats.label")}
      className='mx-auto max-w-7xl px-6 pt-20 pb-10'>
      <dl className='grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4'>
        <StatTile
          label={t("stats.downloads.label")}
          value={
            stats
              ? t("stats.downloads.value", {
                  value: compactNumber.format(stats.appDownloads),
                })
              : "…"
          }
          note={t("stats.downloads.note")}
        />
        <StatTile
          label={t("stats.users.label")}
          value={stats ? compactNumber.format(stats.totalUsers) : "…"}
          note={t("stats.users.note")}
        />
        <StatTile
          label={t("stats.release.label")}
          value={version ? `v${version}` : "…"}
          note={
            <a
              href={
                version ? getReleaseUrl(version) : `${GITHUB_REPO}/releases`
              }
              target='_blank'
              rel='noopener noreferrer'
              className='underline underline-offset-3 transition-colors hover:text-foreground'>
              {t("stats.release.note")}
            </a>
          }
        />
        <StatTile
          label={t("stats.price.label")}
          value={t("stats.price.value")}
          note={t("stats.price.note")}
        />
      </dl>
    </section>
  );
};

const TrustList = ({
  heading,
  items,
  icon: Icon,
  iconClassName,
}: {
  heading: string;
  items: string[];
  icon: LucideIcon;
  iconClassName: string;
}) => (
  <div>
    <h3 className='font-medium text-[13px] text-muted-foreground'>{heading}</h3>
    <ul className='mt-3 flex flex-col gap-3 text-[15px] text-foreground-soft leading-normal'>
      {items.map((item) => (
        <li key={item} className='flex gap-2.5'>
          <Icon
            aria-hidden='true'
            className={cn("mt-1 size-4 shrink-0", iconClassName)}
            strokeWidth={2.25}
          />
          {item}
        </li>
      ))}
    </ul>
  </div>
);

export const TrustSection = () => {
  const { t } = useTranslation("home");

  return (
    <section className='mx-auto max-w-7xl px-6 pt-20 pb-10'>
      <div className='flex flex-wrap gap-4'>
        <div className='min-w-0 flex-[1.2_1_380px] rounded-2xl border border-border bg-surface p-6 sm:p-8'>
          <h2 className='font-bold font-primary text-[34px] leading-[1.1]'>
            {t("trust.title")}
          </h2>
          <div className='mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5'>
            <TrustList
              heading={t("trust.does.heading")}
              items={Object.values(
                t("trust.does.items", { returnObjects: true }),
              )}
              icon={Check}
              iconClassName='text-online'
            />
            <TrustList
              heading={t("trust.never.heading")}
              items={Object.values(
                t("trust.never.items", { returnObjects: true }),
              )}
              icon={X}
              iconClassName='text-red-400'
            />
          </div>
        </div>
        <div className='relative min-w-0 flex-[1_1_300px] overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8'>
          <div
            aria-hidden='true'
            className='-right-15 -bottom-15 pointer-events-none absolute size-60 opacity-[0.06]'>
            <Logo className='size-full' />
          </div>
          <div className='relative'>
            <h2 className='font-bold font-primary text-[34px] leading-[1.1]'>
              {t("trust.openSource.title")}
            </h2>
            <p className='mt-3.5 text-[15px] text-muted-foreground leading-relaxed'>
              {t("trust.openSource.body")}
            </p>
            <div className='mt-5 flex flex-wrap gap-x-7'>
              <a
                href={GITHUB_REPO}
                target='_blank'
                rel='noopener noreferrer'
                className={secondaryCta("sm")}>
                {t("trust.openSource.github")}
                <CtaArrow />
              </a>
              <Link to='/transparency' className={secondaryCta("sm")}>
                {t("trust.openSource.transparency")}
                <CtaArrow />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const TOOLS = [
  { id: "randomizer", to: "/randomizer", icon: Dices },
  { id: "crosshair", to: "/crosshair-generator", icon: Crosshair },
  { id: "vpk", to: "/vpk-analyzer", icon: Package },
  { id: "kv", to: "/kv-parser", icon: FileCode },
] as const satisfies readonly {
  id: string;
  to: "/randomizer" | "/crosshair-generator" | "/vpk-analyzer" | "/kv-parser";
  icon: LucideIcon;
}[];

export const WebToolsSection = () => {
  const { t } = useTranslation("home");

  return (
    <section
      id='tools'
      className='mx-auto max-w-7xl scroll-mt-6 px-6 pt-20 pb-10'>
      <SectionHeading title={t("tools.title")} size='md' />
      <div className='mt-8 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3'>
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className='flex items-center gap-3.5 rounded-xl border border-border bg-surface p-[18px] transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:hover:translate-y-0'>
            <span className='flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground'>
              <tool.icon aria-hidden='true' className='size-5' />
            </span>
            <span>
              <span className='block font-semibold'>
                {t(`tools.items.${tool.id}.title`)}
              </span>
              <span className='block text-[13px] text-muted-foreground'>
                {t(`tools.items.${tool.id}.description`)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
};
