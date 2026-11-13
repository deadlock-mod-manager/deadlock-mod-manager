import { expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import type { MatchHistoryEntry, MatchMetadata } from "@/lib/stats/api";
import {
  matchHistoryEntrySchema,
  matchMetadataSchema,
  steamProfileSchema,
} from "@/lib/validation/stats-api";
import en from "@/locales/en.json";

const Container = ({ children }: { children: ReactNode }) => (
  <div>{children}</div>
);
const Icon = () => <svg />;
mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: Container,
}));
mock.module("@deadlock-mods/ui/components/card", () => ({ Card: Container }));
mock.module("@deadlock-mods/ui/components/sonner", () => ({
  toast: { success: () => {}, error: () => {} },
}));
mock.module("@deadlock-mods/ui/components/toggle-group", () => ({
  ToggleGroup: Container,
  ToggleGroupItem: Container,
}));
mock.module("@deadlock-mods/ui/icons", () => ({
  ArrowLeft: Icon,
  Calendar: Icon,
  ChevronLeft: Icon,
  ChevronRight: Icon,
  Copy: Icon,
  Flag: Icon,
  Hash: Icon,
  Hammer: Icon,
  LayoutDashboard: Icon,
  Swords: Icon,
  Timer: Icon,
  Users: Icon,
}));
mock.module("@/components/stats/hero-avatar", () => ({ HeroAvatar: Icon }));

const { MatchHeader } = await import("./match-header");

const metadata = matchMetadataSchema.parse({
  match_info: {
    match_id: 133901798,
    duration_s: 2757,
    winning_team: 1,
    players: [{ account_id: 1, hero_id: 13, team: 0 }],
  },
}).match_info;

const history = (outcome: number): MatchHistoryEntry =>
  matchHistoryEntrySchema.parse({
    account_id: 1,
    match_id: metadata.match_id,
    hero_id: 13,
    start_time: 1_700_000_000,
    match_duration_s: metadata.duration_s,
    player_team: 0,
    match_result: 1,
    player_match_outcome: outcome,
  });

const renderHeader = async (
  entry: MatchHistoryEntry | undefined,
  info: MatchMetadata["match_info"] = metadata,
) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  const me = info.players[0];
  if (!me) throw new Error("Missing test player");
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <MatchHeader
          heroesById={new Map()}
          profiles={
            new Map([
              [
                2,
                steamProfileSchema.parse({
                  account_id: 2,
                  personaname: "Boomo6349",
                }),
              ],
            ])
          }
          damageRank={null}
          hero={undefined}
          historyEntry={entry}
          match={info}
          me={me}
          nextId={null}
          onViewChange={() => {}}
          previousId={null}
          rankChange={null}
          view='overview'
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
};

it("shows a 45-minute non-scored match neutrally despite the team's defeat", async () => {
  const html = await renderHeader(history(5));
  expect(html).toContain("Not scored");
  expect(html).toContain("color:var(--viz-muted)");
  expect(html).toContain("45:57");
  expect(html).not.toContain("Defeat");
});

it("keeps the defeat heading for a scored loss", async () => {
  const html = await renderHeader(history(2));
  expect(html).toContain("Defeat");
  expect(html).not.toContain("Not scored");
});

it("falls back to the team result when player history is unavailable", async () => {
  const html = await renderHeader(undefined);
  expect(html).toContain("Defeat");
  expect(html).not.toContain("Not scored");
});

it("shows the teammate's name and departure time for a non-scored match", async () => {
  const info = matchMetadataSchema.parse({
    match_info: {
      ...metadata,
      players: [
        { account_id: 1, hero_id: 13, team: 0, player_match_outcome: 5 },
        {
          account_id: 2,
          hero_id: 15,
          team: 0,
          abandon_match_time_s: 2459,
          player_match_outcome: 3,
        },
      ],
    },
  }).match_info;
  const html = await renderHeader(undefined, info);
  expect(html).toContain("Not scored");
  expect(html).toContain("Boomo6349 (#15) at 40:59");
  expect(html).not.toContain("Defeat");
});

it("shows a personal abandon with its time instead of a generic defeat", async () => {
  const info = matchMetadataSchema.parse({
    match_info: {
      ...metadata,
      players: [
        {
          account_id: 1,
          hero_id: 13,
          team: 0,
          abandon_match_time_s: 2459,
          player_match_outcome: 3,
        },
      ],
    },
  }).match_info;
  const html = await renderHeader(undefined, info);
  expect(html).toContain("Abandoned");
  expect(html).toContain("You were recorded as abandoning at 40:59.");
  expect(html).not.toContain("Defeat");
});

it("keeps an unknown non-score reason explicit", async () => {
  const html = await renderHeader(history(5));
  expect(html).toContain(
    "The data does not identify why this match was not scored.",
  );
  expect(html).not.toContain("Teammates recorded as abandoning");
});
