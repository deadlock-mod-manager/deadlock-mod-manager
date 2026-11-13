import { beforeEach, expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import type { MatchMetadata } from "@/lib/stats/api";
import {
  matchHistoryEntrySchema,
  matchMetadataSchema,
  playerHeroStatsSchema,
} from "@/lib/validation/stats-api";
import en from "@/locales/en.json";

const Container = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
);
const Empty = () => null;
mock.module("@deadlock-mods/ui/components/card", () => ({ Card: Container }));
mock.module("@deadlock-mods/ui/components/chart", () => ({
  ChartContainer: Container,
}));
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: Container,
}));
mock.module("@deadlock-mods/ui/components/skeleton", () => ({
  Skeleton: Empty,
}));
mock.module("@deadlock-mods/ui/components/tooltip", () => ({
  Tooltip: Container,
  TooltipContent: Container,
  TooltipTrigger: Container,
}));
mock.module("@deadlock-mods/ui/components/badge", () => ({
  Badge: ({ children, variant }: { children: ReactNode; variant: string }) => (
    <span data-badge={variant}>{children}</span>
  ),
}));
mock.module("@deadlock-mods/ui/icons", () => ({ RefreshCw: Empty }));
mock.module("recharts", () => ({
  Area: Empty,
  AreaChart: Empty,
  ReferenceLine: Empty,
  YAxis: Empty,
}));
mock.module("@/components/stats/hero-avatar", () => ({ HeroAvatar: Empty }));
mock.module("@/components/stats/hero-pool", () => ({ HeroPool: Empty }));
mock.module("@/components/stats/form-chart", () => ({ FormChart: Empty }));
mock.module("@/components/stats/chart-card", () => ({ ChartCard: Container }));
mock.module("@/components/stats/item-purchase-timeline", () => ({
  ItemPurchaseTimeline: Empty,
}));

let metadata: MatchMetadata["match_info"] | null = null;
let pending = false;
let failed = false;
mock.module("@/hooks/use-player-stats", () => ({
  useMatchDetails: () => ({
    match: metadata,
    player: metadata?.players[0] ?? null,
    itemsById: new Map(),
    isPending: pending,
    isError: failed,
    refetch: async () => {},
  }),
}));

const { MatchDetailView } = await import("./match-detail-view");
const { PlayerCareerOverview } = await import("./player-career-overview");
const { TrendStrip, WinrateRing } = await import("./trend-strip");

const history = matchHistoryEntrySchema.parse({
  account_id: 1,
  match_id: 133901798,
  hero_id: 13,
  start_time: 1_700_000_000,
  match_duration_s: 2757,
  player_team: 0,
  match_result: 1,
});
const unscored = { ...history, player_match_outcome: 5 };
const won = { ...history, match_result: 0, player_match_outcome: 1 };
const career = playerHeroStatsSchema.parse({
  account_id: 1,
  hero_id: 13,
  matches_played: 10,
  wins: 5,
});

const render = async (content: ReactNode) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{content}</I18nextProvider>,
  );
};
const renderDetails = () =>
  render(
    <MatchDetailView accountId={1} match={history} heroesById={new Map()} />,
  );
const renderCareer = (matches = [unscored]) =>
  render(
    <PlayerCareerOverview
      matches={matches}
      heroStats={[career]}
      heroesById={new Map()}
      isPending={false}
      isHeroStatsPending={false}
      onSelectMatch={() => {}}
      onSelectHero={() => {}}
    />,
  );

beforeEach(() => {
  metadata = null;
  pending = false;
  failed = false;
});

it("uses a metadata-only non-scored outcome in the compact detail badge", async () => {
  metadata = matchMetadataSchema.parse({
    match_info: {
      match_id: history.match_id,
      winning_team: 1,
      players: [
        { account_id: 1, hero_id: 13, team: 0, player_match_outcome: 5 },
      ],
    },
  }).match_info;
  expect(await renderDetails()).toContain('data-badge="outline">Not scored');
});

it("uses a metadata-only departure in the compact detail badge", async () => {
  metadata = matchMetadataSchema.parse({
    match_info: {
      match_id: history.match_id,
      winning_team: 1,
      players: [
        { account_id: 1, hero_id: 13, team: 0, abandon_match_time_s: 2459 },
      ],
    },
  }).match_info;
  expect(await renderDetails()).toContain('data-badge="destructive">Abandoned');
});

it("keeps the history fallback while metadata is loading", async () => {
  pending = true;
  expect(await renderDetails()).toContain('data-badge="destructive">Loss');
});

it("keeps the history fallback when metadata fails", async () => {
  failed = true;
  expect(await renderDetails()).toContain('data-badge="destructive">Loss');
});

it("shows an unavailable rate and muted record for an entirely unscored recent window", async () => {
  const html = await renderCareer();
  expect(html).toContain('style="color:var(--viz-muted)">0W 0L, –');
  expect(html).not.toContain("0W 0L, 0%");
});

it("still shows a real zero winrate as a decline against a positive career rate", async () => {
  const html = await renderCareer([{ ...history, player_match_outcome: 2 }]);
  expect(html).toContain('style="color:var(--viz-loss)">0W 1L, 0%');
});

it("leaves only the neutral ring track when no scored results exist", () => {
  const html = renderToStaticMarkup(<WinrateRing winrate={null} />);
  expect(html).toContain('stroke-opacity="0.07"');
  expect(html).not.toContain("stroke-dasharray");
  expect(html).not.toContain("var(--viz-loss)");
});

it("shows no percentage or result arc in the entirely unscored trend strip", async () => {
  const html = await render(
    <TrendStrip matches={[unscored]} bracket={[]} bracketName={null} />,
  );
  expect(html).toContain("0W 0L");
  expect(html).toContain("–");
  expect(html).not.toContain("0%");
  expect(html).not.toContain("stroke-dasharray");
});

it("keeps the scored result's percentage when a trend window also contains a non-score", async () => {
  const html = await render(
    <TrendStrip matches={[unscored, won]} bracket={[]} bracketName={null} />,
  );
  expect(html).toContain("1W 0L");
  expect(html).toContain("100%");
  expect(html).toContain("stroke-dasharray");
});
