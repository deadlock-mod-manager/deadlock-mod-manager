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
import Logo from "@/components/logo";
import { GITHUB_REPO } from "@/lib/constants";
import { getReleaseUrl } from "@/lib/release-downloads";
import { orpc } from "@/utils/orpc";
import { SectionHeading } from "./section-heading";
import { CtaArrow, secondaryCta } from "./cta";

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

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
  const { data: stats } = useQuery(orpc.getStats.queryOptions());
  const { data: release } = useQuery(orpc.getVersion.queryOptions());
  const version = release?.version === "unknown" ? undefined : release?.version;

  return (
    <section aria-label='Stats' className='mx-auto max-w-7xl px-6 pt-20 pb-10'>
      <dl className='grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4'>
        <StatTile
          label='App downloads'
          value={stats ? `${compactNumber.format(stats.appDownloads)}+` : "…"}
          note='Across every release'
        />
        <StatTile
          label='Registered users'
          value={stats ? compactNumber.format(stats.totalUsers) : "…"}
          note='Signed up so far'
        />
        <StatTile
          label='Latest release'
          value={version ? `v${version}` : "…"}
          note={
            <a
              href={
                version ? getReleaseUrl(version) : `${GITHUB_REPO}/releases`
              }
              target='_blank'
              rel='noopener noreferrer'
              className='underline underline-offset-3 transition-colors hover:text-foreground'>
              Read the release notes
            </a>
          }
        />
        <StatTile label='Price' value='Free' note='Open source since day one' />
      </dl>
    </section>
  );
};

const DOES = [
  "Copies .vpk mod files into your addons folder",
  "Backs up before making changes, restores in one click",
  "Lets you launch vanilla any time",
];

const NEVER = [
  "Patches the Deadlock executable",
  "Changes what other players see",
  "Sends analytics unless you opt in",
];

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

export const TrustSection = () => (
  <section className='mx-auto max-w-7xl px-6 pt-20 pb-10'>
    <div className='flex flex-wrap gap-4'>
      <div className='min-w-0 flex-[1.2_1_380px] rounded-2xl border border-border bg-surface p-6 sm:p-8'>
        <h2 className='font-bold font-primary text-[34px] leading-[1.1]'>
          How it handles your game
        </h2>
        <div className='mt-6 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5'>
          <TrustList
            heading='What it does'
            items={DOES}
            icon={Check}
            iconClassName='text-online'
          />
          <TrustList
            heading='What it never does'
            items={NEVER}
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
            Open source
          </h2>
          <p className='mt-3.5 text-[15px] text-muted-foreground leading-relaxed'>
            The code is on GitHub under GPL-3.0, and the community translates
            the app on Crowdin.
          </p>
          <div className='mt-5 flex flex-wrap gap-x-7'>
            <a
              href={GITHUB_REPO}
              target='_blank'
              rel='noopener noreferrer'
              className={secondaryCta("sm")}>
              View on GitHub
              <CtaArrow />
            </a>
            <Link to='/transparency' className={secondaryCta("sm")}>
              Transparency
              <CtaArrow />
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const TOOLS: {
  to: "/randomizer" | "/crosshair-generator" | "/vpk-analyzer" | "/kv-parser";
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    to: "/randomizer",
    title: "Randomizer",
    description: "Roll a hero for your next match",
    icon: Dices,
  },
  {
    to: "/crosshair-generator",
    title: "Crosshair generator",
    description: "Make one and copy the config",
    icon: Crosshair,
  },
  {
    to: "/vpk-analyzer",
    title: "VPK analyzer",
    description: "See what's inside a .vpk",
    icon: Package,
  },
  {
    to: "/kv-parser",
    title: "KV parser",
    description: "Read Valve KeyValues files",
    icon: FileCode,
  },
];

export const WebToolsSection = () => (
  <section
    id='tools'
    className='mx-auto max-w-7xl scroll-mt-6 px-6 pt-20 pb-10'>
    <SectionHeading title='Free tools on the site' size='md' />
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
            <span className='block font-semibold'>{tool.title}</span>
            <span className='block text-[13px] text-muted-foreground'>
              {tool.description}
            </span>
          </span>
        </Link>
      ))}
    </div>
  </section>
);
