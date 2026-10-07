import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CheckIcon,
  LinkSimpleIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import {
  ChangeGroup,
  CompositionBar,
  KINDS,
} from "@/components/changelog/change-list";
import { CtaArrow } from "@/components/home/cta";
import type { Change, ChangeKind, Release } from "@/lib/changelog";
import { SITE_URL } from "@/lib/constants";
import {
  DESKTOP_RELEASES,
  NEXT_VERSION,
  PREVIEW_VERSION,
} from "@/lib/desktop-changelog";
import { seo } from "@/utils/seo";

// English-only like the release notes it is built from: the entries come
// straight from the desktop app's changesets.
export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
  head: () =>
    seo({
      title: "Changelog | Deadlock Mod Manager",
      description:
        "Every new feature, improvement and fix in the Deadlock Mod Manager desktop app, release by release.",
      path: "/changelog",
    }),
});

type Filter = ChangeKind | "all";

const ERAS = [
  { major: "2", name: "V2" },
  { major: "1", name: "V1" },
  { major: "0", name: "Early access" },
];

const eraOf = (version: string) =>
  version === NEXT_VERSION ? "2" : version.split(".")[0];

const TOTAL_CHANGES = DESKTOP_RELEASES.reduce(
  (sum, release) => sum + release.changes.length,
  0,
);

/** The oldest entry in the changelog, typo and all. */
const ORIGIN = DESKTOP_RELEASES.at(-1);

const matches = (change: Change, query: string) =>
  [change.summary, ...change.details].some((line) =>
    line.toLowerCase().includes(query),
  );

const releaseLabel = (version: string) => {
  if (version === NEXT_VERSION) return "Not released yet";
  if (version === PREVIEW_VERSION) return "Preview";
  return null;
};

const CopyLinkButton = ({ version }: { version: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type='button'
      onClick={async () => {
        await navigator.clipboard.writeText(
          `${SITE_URL}/changelog#v${version}`,
        );
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className='inline-flex items-center gap-1.5 rounded text-muted-foreground text-xs opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary group-hover/release:opacity-100 max-md:opacity-100'>
      {copied ? (
        <CheckIcon aria-hidden='true' weight='bold' className='size-3.5' />
      ) : (
        <LinkSimpleIcon aria-hidden='true' weight='bold' className='size-3.5' />
      )}
      <span role='status'>{copied ? "Link copied" : "Copy link"}</span>
    </button>
  );
};

const ReleaseEntry = ({
  release,
  changes,
  query,
}: {
  release: Release;
  changes: Change[];
  query: string;
}) => {
  const label = releaseLabel(release.version);
  const live = label !== null;
  const groups = KINDS.map(({ kind }) => ({
    kind,
    changes: changes.filter((change) => change.kind === kind),
  })).filter((group) => group.changes.length > 0);

  return (
    <article
      id={`v${release.version}`}
      className='group/release relative grid scroll-mt-28 gap-4 pb-14 pl-9 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 md:pl-12'>
      <span
        aria-hidden='true'
        className='absolute top-[11px] left-0 flex size-[13px] items-center justify-center'>
        {live && (
          <span className='absolute inset-0 rounded-full bg-primary/50 motion-safe:animate-ping' />
        )}
        <span
          className={cn(
            "relative size-[13px] rounded-full border-2",
            live
              ? "border-primary bg-primary"
              : "border-border-hover bg-background group-target/release:border-primary",
          )}
        />
      </span>

      <header className='md:sticky md:top-28 md:self-start'>
        <h2 className='font-bold font-primary text-3xl group-target/release:text-primary'>
          <a href={`#v${release.version}`} className='hover:text-primary'>
            {release.version}
          </a>
        </h2>
        <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-2'>
          {label && (
            <span className='rounded-full border border-primary/40 px-2.5 py-0.5 font-medium text-primary text-xs'>
              {label}
            </span>
          )}
          <span className='text-muted-foreground text-xs tabular-nums'>
            {release.changes.length}{" "}
            {release.changes.length === 1 ? "change" : "changes"}
          </span>
        </div>
        <div className='mt-3'>
          <CompositionBar changes={release.changes} />
        </div>
        <div className='mt-3'>
          <CopyLinkButton version={release.version} />
        </div>
      </header>

      <div className='flex max-w-[72ch] flex-col gap-8'>
        {release.version === "2.0.0" && !query && (
          <Link
            to='/v2'
            className='group/cta flex items-center justify-between gap-4 rounded-xl border border-primary/40 bg-surface p-5 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
            <span>
              <span className='block font-semibold'>What's new in V2</span>
              <span className='mt-1 block text-muted-foreground text-sm'>
                What changed, and what happens to your mods when you upgrade
                from V1.
              </span>
            </span>
            <CtaArrow />
          </Link>
        )}
        {groups.map((group) => (
          <ChangeGroup key={group.kind} {...group} query={query} />
        ))}
      </div>
    </article>
  );
};

function ChangelogPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());

  const searched = DESKTOP_RELEASES.map((release) => ({
    release,
    changes: query
      ? release.changes.filter((change) => matches(change, query))
      : release.changes,
  }));
  const counts = Object.fromEntries(
    KINDS.map(({ kind }) => [
      kind,
      searched.reduce(
        (sum, entry) =>
          sum + entry.changes.filter((change) => change.kind === kind).length,
        0,
      ),
    ]),
  );
  const visible = searched
    .map(({ release, changes }) => ({
      release,
      changes:
        filter === "all"
          ? changes
          : changes.filter((change) => change.kind === filter),
    }))
    .filter((entry) => entry.changes.length > 0);
  const filters: { kind: Filter; label: string; count: number }[] = [
    {
      kind: "all",
      label: "All",
      count: KINDS.reduce((sum, { kind }) => sum + (counts[kind] ?? 0), 0),
    },
    ...KINDS.map(({ kind, label }) => ({
      kind,
      label,
      count: counts[kind] ?? 0,
    })),
  ];

  return (
    <div className='overflow-x-clip'>
      <section className='relative isolate overflow-hidden'>
        <div aria-hidden='true' className='-z-10 absolute inset-0'>
          <div className='absolute inset-0 bg-[url(/backgrounds/bg-1.jpg)] bg-cover bg-[center_30%] opacity-20 [mask-image:radial-gradient(110%_90%_at_80%_20%,black_15%,transparent_70%)]' />
          <div className='absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,var(--color-background)_100%)]' />
        </div>
        <div className='mx-auto max-w-7xl px-6 pt-16 pb-10 lg:pt-24'>
          <h1 className='font-bold font-primary text-[clamp(44px,5.4vw,76px)] leading-[0.98] tracking-[-0.02em]'>
            Changelog
          </h1>
          <p className='mt-5 max-w-[58ch] text-pretty text-lg text-muted-foreground leading-relaxed'>
            <span className='text-foreground tabular-nums'>
              {TOTAL_CHANGES.toLocaleString("en")} changes
            </span>{" "}
            across {DESKTOP_RELEASES.length} releases of the desktop app, newest
            first.
          </p>
        </div>
      </section>

      <div className='sticky top-0 z-20 border-border border-y bg-background'>
        <div className='mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3'>
          <label className='relative flex min-w-0 flex-1 basis-64 items-center'>
            <span className='sr-only'>Search the changelog</span>
            <MagnifyingGlassIcon
              aria-hidden='true'
              className='pointer-events-none absolute left-3 size-4 text-muted-foreground'
            />
            <input
              type='search'
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search: a hero, "profiles", "Linux"…'
              className='h-10 w-full rounded-lg border border-border bg-surface pr-9 pl-9 text-sm placeholder:text-foreground-subtle focus-visible:border-primary focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden'
            />
            {search && (
              <button
                type='button'
                aria-label='Clear search'
                onClick={() => setSearch("")}
                className='absolute right-2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary'>
                <XIcon aria-hidden='true' weight='bold' className='size-3.5' />
              </button>
            )}
          </label>
          <fieldset className='flex flex-wrap gap-1.5'>
            <legend className='sr-only'>Show changes</legend>
            {filters.map((option) => (
              <button
                key={option.kind}
                type='button'
                aria-pressed={filter === option.kind}
                onClick={() => setFilter(option.kind)}
                className='inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-muted-foreground text-sm hover:border-border-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 aria-pressed:border-transparent aria-pressed:bg-foreground aria-pressed:text-background'>
                {option.label}
                <span className='tabular-nums opacity-60'>{option.count}</span>
              </button>
            ))}
          </fieldset>
        </div>
      </div>

      <div className='mx-auto max-w-7xl px-6 pt-12 pb-24'>
        {visible.length === 0 ? (
          <div className='py-16'>
            <p className='font-bold font-primary text-3xl'>
              Nothing matches "{search.trim()}".
            </p>
            <p className='mt-3 text-muted-foreground'>
              Try a hero name, a feature like "profiles", or a platform like
              "Linux".
            </p>
            <button
              type='button'
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
              className='mt-6 font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
              Show everything
            </button>
          </div>
        ) : (
          ERAS.map((era) => {
            const releases = visible.filter(
              (entry) => eraOf(entry.release.version) === era.major,
            );
            if (releases.length === 0) return null;
            return (
              <section key={era.major} aria-label={era.name} className='mb-6'>
                <p
                  aria-hidden='true'
                  className='mb-8 font-bold font-primary text-[clamp(56px,9vw,120px)] text-border-strong leading-none tracking-[-0.03em]'>
                  {era.name}
                </p>
                <div className='relative before:absolute before:top-3 before:bottom-0 before:left-[6px] before:w-px before:bg-border'>
                  {releases.map((entry) => (
                    <ReleaseEntry
                      key={entry.release.version}
                      release={entry.release}
                      changes={entry.changes}
                      query={query}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}

        {ORIGIN && !query && filter === "all" && (
          <figure className='mt-4 border-border border-t pt-12'>
            <figcaption className='text-muted-foreground text-sm'>
              Where it started: the first line of {ORIGIN.version}, typo and
              all.
            </figcaption>
            <blockquote className='mt-3 max-w-[30ch] text-balance font-bold font-primary text-[clamp(28px,3.4vw,44px)] leading-[1.1]'>
              "{ORIGIN.changes[0]?.summary}"
            </blockquote>
          </figure>
        )}
      </div>
    </div>
  );
}
