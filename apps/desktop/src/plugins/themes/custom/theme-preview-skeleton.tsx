import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { hexToRgb } from "./theme-color-utils";
import {
  buildAmbientBackgroundStyle,
  buildFullCustomThemeCssVariables,
} from "./theme-css-vars";
import type { CustomThemePalette } from "./types";

const hoverInteractive =
  "cursor-default transition-transform duration-200 ease-out motion-safe:hover:z-[1] motion-safe:hover:-translate-y-px motion-safe:hover:shadow-md";

export type ThemePreviewSkeletonProps = {
  palette: CustomThemePalette;
};

type PreviewRouteId =
  | "dashboard"
  | "downloads"
  | "settings"
  | "my-mods"
  | "get-mods"
  | "maps"
  | "servers"
  | "crosshairs"
  | "autoexec"
  | "developer"
  | "documentation"
  | "need-help";

type PreviewNavRow = {
  id: PreviewRouteId;
  badgeStub?: boolean;
  wideBadgeStub?: boolean;
};

type PreviewGroupDef = {
  groupKey: string;
  rows: PreviewNavRow[];
};

function sidebarBarMaxPx(routeId: PreviewRouteId): number {
  let sum = 0;
  for (let index = 0; index < routeId.length; index += 1) {
    sum += routeId.charCodeAt(index);
  }
  return 46 + (sum % 26);
}

const PREVIEW_GROUPS: PreviewGroupDef[] = [
  {
    groupKey: "g-general",
    rows: [
      { id: "dashboard" },
      { id: "downloads", badgeStub: true },
      { id: "settings" },
    ],
  },
  {
    groupKey: "g-mods",
    rows: [
      { id: "my-mods", wideBadgeStub: true },
      { id: "get-mods" },
      { id: "maps" },
    ],
  },
  {
    groupKey: "g-mp",
    rows: [{ id: "servers" }],
  },
  {
    groupKey: "g-custom",
    rows: [{ id: "crosshairs" }, { id: "autoexec" }],
  },
  {
    groupKey: "g-dev",
    rows: [
      { id: "developer" },
      { id: "documentation" },
      { id: "need-help" },
    ],
  },
];

type LayoutSilhouette =
  | "home"
  | "stack"
  | "grid"
  | "split"
  | "orbit"
  | "surface";

function silhouetteForRoute(route: PreviewRouteId): LayoutSilhouette {
  switch (route) {
    case "dashboard":
      return "home";
    case "downloads":
    case "servers":
      return "stack";
    case "my-mods":
    case "get-mods":
      return "grid";
    case "settings":
    case "maps":
    case "documentation":
    case "need-help":
      return "split";
    case "crosshairs":
      return "orbit";
    case "autoexec":
    case "developer":
      return "surface";
  }
}

function WindowChromeStub() {
  const btn =
    "flex h-7 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";
  return (
    <div
      aria-hidden='true'
      className='flex shrink-0 items-stretch border-l border-border/50 pl-1.5'>
      <div className={cn(btn)}>
        <span className='block h-px w-3 bg-current opacity-70' />
      </div>
      <div className={cn(btn)}>
        <span className='block h-2 w-2 border border-current opacity-70' />
      </div>
      <div className={cn(btn, "hover:bg-destructive/15 hover:text-destructive")}>
        <span className='block h-2 w-2 rounded-sm border border-current opacity-70' />
      </div>
    </div>
  );
}

function SkeletonTitleStub() {
  return (
    <div className='flex shrink-0 flex-col gap-1'>
      <div className='h-2 w-[38%] max-w-[120px] rounded bg-foreground/18' />
      <div className='h-1.5 w-[55%] max-w-[180px] rounded bg-muted-foreground/26' />
    </div>
  );
}

function PreviewMainPanel({ route }: Readonly<{ route: PreviewRouteId }>) {
  const silhouette = silhouetteForRoute(route);

  const homeLayout = (
    <>
      <SkeletonTitleStub />
      <div
        className={cn(
          "relative min-h-[64px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted/35",
          hoverInteractive,
        )}>
        <div className='absolute inset-0 bg-gradient-to-br from-muted/90 via-muted/35 to-primary/[0.1]' />
        <div className='absolute inset-y-2 left-2 flex w-[46%] flex-col gap-1'>
          <span className='h-1 max-w-[5rem] rounded-full bg-primary/45' />
          <span className='h-2.5 w-[88%] rounded bg-foreground/18' />
          <span className='h-1.5 w-[48%] rounded bg-muted-foreground/28' />
        </div>
        <div className='absolute bottom-2 right-2'>
          <span
            className={cn(
              "flex h-6 items-center rounded-md bg-primary px-2 text-primary-foreground",
              hoverInteractive,
            )}>
            <span className='h-1.5 w-10 rounded bg-primary-foreground/35' />
          </span>
        </div>
      </div>
      <div className='flex shrink-0 gap-1.5'>
        {[
          { id: "home-stat-a", widthPct: 52 },
          { id: "home-stat-b", widthPct: 68 },
          { id: "home-stat-c", widthPct: 61 },
        ].map((slot) => (
          <div
            key={slot.id}
            className={cn(
              "flex min-h-[38px] min-w-[3.25rem] flex-1 flex-col justify-center gap-1 rounded-md border border-border/75 bg-muted/22 px-2 py-1",
              hoverInteractive,
            )}>
            <span className='h-1 max-w-[2rem] rounded-full bg-muted-foreground/26' />
            <span
              className='h-2 rounded bg-foreground/15'
              style={{ width: `${slot.widthPct}%` }}
            />
          </div>
        ))}
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-1.5'>
        <span className='h-1.5 w-24 shrink-0 rounded bg-muted-foreground/30' />
        <div className='flex gap-1 overflow-hidden'>
          {[
            { id: "home-thumb-a", widthPx: 76 },
            { id: "home-thumb-b", widthPx: 76 },
            { id: "home-thumb-c", widthPx: 76 },
            { id: "home-thumb-d", widthPx: 76 },
            { id: "home-thumb-e", widthPx: 76 },
          ].map((thumb) => (
            <div
              key={thumb.id}
              className={cn(
                "aspect-video h-[48px] shrink-0 rounded-md border border-border bg-muted/85",
                hoverInteractive,
              )}
              style={{ width: `${thumb.widthPx}px` }}
            />
          ))}
        </div>
      </div>
    </>
  );

  const stackLayout = (
    <>
      <SkeletonTitleStub />
      <div className='flex flex-col gap-1.5'>
        {[
          { id: "preview-stack-a", barPct: 36 },
          { id: "preview-stack-b", barPct: 53 },
          { id: "preview-stack-c", barPct: 70 },
          { id: "preview-stack-d", barPct: 87 },
        ].map((slot) => (
          <div
            key={slot.id}
            className={cn(
              "rounded-md border border-border/75 bg-muted/22 p-2",
              hoverInteractive,
            )}>
            <div className='mb-2 flex gap-2'>
              <span className='h-7 w-7 shrink-0 rounded-md bg-muted/85' />
              <div className='flex min-w-0 flex-1 flex-col gap-1'>
                <span className='h-2 w-[70%] rounded bg-foreground/16' />
                <span className='h-1.5 w-[42%] rounded bg-muted-foreground/26' />
              </div>
              <span className='h-2 w-7 shrink-0 rounded bg-muted-foreground/28' />
            </div>
            <span className='block h-1.5 overflow-hidden rounded-full bg-muted'>
              <span
                className='block h-full rounded-full bg-primary/45'
                style={{ width: `${slot.barPct}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </>
  );

  const gridLayout = (
    <>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <SkeletonTitleStub />
        <span className='h-6 max-w-[8rem] flex-1 rounded-md border border-border bg-muted/25'>
          <span className='inline-block h-1.5 w-[58%] translate-y-[0.45rem] rounded bg-muted-foreground/26' />
        </span>
      </div>
      <div className='grid grid-cols-2 gap-1.5 sm:grid-cols-3'>
        {[
          "preview-card-a",
          "preview-card-b",
          "preview-card-c",
          "preview-card-d",
          "preview-card-e",
          "preview-card-f",
        ].map((slotId) => (
          <div
            key={slotId}
            className={cn(
              "flex flex-col gap-1 rounded-lg border border-border bg-card p-2",
              hoverInteractive,
            )}>
            <div className='aspect-video w-full rounded-md bg-muted/85' />
            <span className='h-1.5 w-[84%] rounded bg-foreground/16' />
            <span className='h-1 w-[38%] rounded bg-muted-foreground/26' />
          </div>
        ))}
      </div>
    </>
  );

  const splitLayout = (
    <div className='flex min-h-0 flex-1 gap-2'>
      <div
        aria-hidden='true'
        className='hidden w-[28%] max-w-[72px] shrink-0 flex-col gap-1 md:flex'>
        {["split-nav-a", "split-nav-b", "split-nav-c"].map((slotId, slotIndex) => (
          <div
            key={slotId}
            className={cn(
              "rounded-md px-2 py-1.5",
              slotIndex === 1 ? "border border-primary/35 bg-muted/35" : "bg-muted/18",
              hoverInteractive,
            )}>
            <span className='block h-1.5 w-full rounded bg-muted-foreground/28' />
          </div>
        ))}
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <SkeletonTitleStub />
        {["split-pane-a", "split-pane-b", "split-pane-c"].map((slotId) => (
          <div
            key={slotId}
            className={cn(
              "rounded-lg border border-border bg-muted/18 p-2",
              hoverInteractive,
            )}>
            <span className='mb-2 block h-2 w-[34%] rounded bg-foreground/14' />
            <span className='mb-1 block h-1.5 w-full rounded bg-muted-foreground/20' />
            <span className='block h-1.5 w-[76%] rounded bg-muted-foreground/18' />
          </div>
        ))}
      </div>
    </div>
  );

  const orbitLayout = (
    <div className='flex flex-col gap-2 md:flex-row'>
      <div
        className={cn(
          "flex aspect-square max-h-[104px] max-w-[104px] shrink-0 items-center justify-center rounded-xl border border-border bg-muted/35 md:w-[38%]",
          hoverInteractive,
        )}>
        <span className='relative block h-14 w-14 rounded-full border border-primary/35'>
          <span className='absolute left-1/2 top-0 h-1/2 w-px -translate-x-px bg-primary/45' />
          <span className='absolute left-0 top-1/2 h-px w-1/2 -translate-y-px bg-primary/45' />
        </span>
      </div>
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <SkeletonTitleStub />
        {[
          { id: "orbit-track-a", trackPct: 52 },
          { id: "orbit-track-b", trackPct: 61 },
          { id: "orbit-track-c", trackPct: 44 },
          { id: "orbit-track-d", trackPct: 73 },
        ].map((track) => (
          <div key={track.id} className='flex flex-col gap-1'>
            <span className='h-1 w-20 rounded bg-muted-foreground/26' />
            <span className='h-2 rounded-md bg-muted'>
              <span
                className='block h-full rounded-md bg-primary/38'
                style={{ width: `${track.trackPct}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const surfaceLayout = (
    <>
      <SkeletonTitleStub />
      <div className='flex min-h-[96px] flex-1 gap-2'>
        <div
          className={cn(
            "flex w-[38%] max-w-[96px] shrink-0 flex-col gap-1 rounded-lg border border-border bg-muted/22 p-2",
            hoverInteractive,
          )}>
          <span className='h-2 rounded bg-muted-foreground/26' />
          <span className='h-2 rounded bg-muted-foreground/22' />
          <span className='h-2 rounded bg-muted-foreground/26' />
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-border bg-muted/14 p-2",
            hoverInteractive,
          )}>
          {[
            { id: "surface-line-a", linePct: 56 },
            { id: "surface-line-b", linePct: 72 },
            { id: "surface-line-c", linePct: 48 },
            { id: "surface-line-d", linePct: 88 },
            { id: "surface-line-e", linePct: 40 },
          ].map((line) => (
            <span
              key={line.id}
              className='h-1 rounded bg-muted-foreground/18'
              style={{ width: `${line.linePct}%` }}
            />
          ))}
        </div>
      </div>
    </>
  );

  let body: ReactNode;
  switch (silhouette) {
    case "home":
      body = homeLayout;
      break;
    case "stack":
      body = stackLayout;
      break;
    case "grid":
      body = gridLayout;
      break;
    case "split":
      body = splitLayout;
      break;
    case "orbit":
      body = orbitLayout;
      break;
    case "surface":
      body = surfaceLayout;
      break;
  }

  return (
    <main className='flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-background p-2'>
      {body}
    </main>
  );
}

export function ThemePreviewSkeleton({ palette }: ThemePreviewSkeletonProps) {
  const { t } = useTranslation();
  const [route, setRoute] = useState<PreviewRouteId>("dashboard");
  const cssVars = buildFullCustomThemeCssVariables(palette);
  const ambientStyle = buildAmbientBackgroundStyle(palette);

  const sidebarFromRgb = hexToRgb(palette.cardColor);
  const sidebarToRgb = hexToRgb(palette.popoverColor);
  const sidebarMix = Math.min(100, Math.max(0, palette.sidebarOpacity)) / 100;
  const skeletonSidebarBg =
    sidebarFromRgb && sidebarToRgb
      ? `rgb(${Math.round(sidebarFromRgb.r + (sidebarToRgb.r - sidebarFromRgb.r) * sidebarMix)}, ${Math.round(sidebarFromRgb.g + (sidebarToRgb.g - sidebarFromRgb.g) * sidebarMix)}, ${Math.round(sidebarFromRgb.b + (sidebarToRgb.b - sidebarFromRgb.b) * sidebarMix)})`
      : undefined;

  return (
    <div className='isolate flex h-full min-h-0 w-full flex-col gap-1.5' style={cssVars}>
      <div className='flex shrink-0 items-center justify-between gap-2'>
        <p className='text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
          {t("plugins.themes.previewTitle")}
        </p>
      </div>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 shadow-lg",
          "bg-muted/25",
        )}>
        <div className='relative flex min-h-[clamp(196px,30vh,400px)] flex-1 flex-col'>
          <div className='flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-background px-1.5'>
            <div
              className={cn(
                "flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-primary/25 px-1.5",
                "bg-gradient-to-r from-primary/[0.06] via-background/50 to-primary/[0.04]",
              )}>
              <span className='h-3.5 w-3.5 shrink-0 rounded-sm bg-muted-foreground/22' />
              <span className='h-1.5 w-12 rounded bg-muted-foreground/35' />
            </div>
            <div className='flex min-w-0 flex-1 justify-center px-1'>
              <div className='h-1.5 max-w-[min(200px,42%)] flex-1 rounded-full bg-muted-foreground/22' />
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              <span
                className={cn(
                  "hidden h-6 shrink-0 rounded-md border border-primary/35 px-1.5 sm:flex sm:items-center",
                )}>
                <span className='h-1.5 w-14 rounded bg-muted-foreground/35' />
              </span>
              <span
                className={cn(
                  "flex h-6 shrink-0 items-center rounded-md bg-primary px-2 text-primary-foreground",
                  hoverInteractive,
                )}>
                <span className='h-1.5 w-12 rounded bg-primary-foreground/35' />
              </span>
            </div>
            <WindowChromeStub />
          </div>

          <div className='flex min-h-0 flex-1'>
            <aside
              className='flex w-[31%] min-w-[104px] shrink-0 flex-col border-r border-sidebar-border text-sidebar-foreground'
              style={{ backgroundColor: skeletonSidebarBg }}>
              <div className='shrink-0 px-2 pb-1 pt-2'>
                <div className='flex items-center gap-2'>
                  <span className='h-4 w-4 shrink-0 rounded-md bg-sidebar-foreground/18 ring-1 ring-sidebar-border/80' />
                  <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <span className='h-1.5 w-[76%] rounded bg-sidebar-foreground/38' />
                    <span className='h-1 w-9 rounded bg-sidebar-foreground/22' />
                  </div>
                </div>
              </div>

              <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2'>
                {PREVIEW_GROUPS.map((group) => (
                  <div key={group.groupKey} className='flex flex-col gap-1'>
                    <span className='px-1 pb-0.5'>
                      <span className='inline-block h-1 w-14 rounded-full bg-sidebar-foreground/28' />
                    </span>
                    <div className='flex flex-col gap-1'>
                      {group.rows.map((row) => {
                        const selected = route === row.id;
                        const barMax = sidebarBarMaxPx(row.id);
                        return (
                          <button
                            key={row.id}
                            type='button'
                            aria-current={selected ? "page" : undefined}
                            aria-label={t('preview.navigationLabel', { name: row.id })}
                            onClick={() => {
                              setRoute(row.id);
                            }}
                            className={cn(
                              "flex min-h-[28px] w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left outline-none transition-colors",
                              "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              selected
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[0_0_0_1px_hsl(var(--sidebar-accent)_/_0.85)]"
                                : "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent)_/_0.65)]",
                              hoverInteractive,
                            )}>
                            <span
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 rounded-sm ring-1 ring-sidebar-border/75",
                                selected
                                  ? "bg-sidebar-accent-foreground/35"
                                  : "bg-sidebar-foreground/30",
                              )}
                            />
                            <span
                              className={cn(
                                "h-2 flex-1 rounded",
                                selected
                                  ? "bg-sidebar-accent-foreground/42"
                                  : "bg-sidebar-foreground/45",
                              )}
                              style={{ maxWidth: `${barMax}px` }}
                            />
                            {row.badgeStub === true ? (
                              <span
                                className={cn(
                                  "ml-auto h-3 min-w-[1rem] shrink-0 rounded-sm ring-1 ring-sidebar-border/75",
                                  selected
                                    ? "bg-sidebar-accent-foreground/32"
                                    : "bg-sidebar-foreground/28",
                                )}
                              />
                            ) : null}
                            {row.wideBadgeStub === true ? (
                              <span
                                className={cn(
                                  "ml-auto h-3 min-w-[1.35rem] shrink-0 rounded-sm ring-1 ring-sidebar-border/75",
                                  selected
                                    ? "bg-sidebar-accent-foreground/32"
                                    : "bg-sidebar-foreground/28",
                                )}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className='shrink-0 border-t border-sidebar-border/80 px-2 py-2'>
                <div className='flex h-6 items-center rounded-lg bg-sidebar-accent/25 px-2 shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border)_/_0.65)]'>
                  <span className='h-1.5 w-[4.25rem] rounded bg-sidebar-foreground/28' />
                </div>
              </div>
            </aside>

            <PreviewMainPanel route={route} />
          </div>

          <footer className='flex h-8 shrink-0 items-center justify-between border-t border-border bg-background px-2'>
            <div className={cn("flex items-center gap-2", hoverInteractive)}>
              <div className='h-1.5 w-20 rounded bg-muted' />
              <div className='h-3 w-px bg-border' />
              <div className='h-1.5 w-14 rounded bg-muted' />
            </div>
            <div className={cn("flex gap-2", hoverInteractive)}>
              <div className='h-1.5 w-9 rounded bg-muted' />
              <div className='h-1.5 w-12 rounded bg-muted' />
            </div>
          </footer>
        </div>
        {ambientStyle !== null ? (
          <div
            aria-hidden
            style={{
              ...ambientStyle,
              position: "absolute",
              inset: 0,
              zIndex: 2,
              borderRadius: "inherit",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>

      <p className='shrink-0 px-0.5 text-center text-[11px] leading-snug text-muted-foreground'>
        {t("plugins.themes.previewHint")}
      </p>
    </div>
  );
}
