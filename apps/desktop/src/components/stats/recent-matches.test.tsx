import { expect, it, mock } from "bun:test";
import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { matchHistoryEntrySchema } from "@/lib/validation/stats-api";
import en from "@/locales/en.json";

mock.module("@/components/stats/hero-avatar", () => ({
  HeroAvatar: () => <span />,
}));
mock.module("@/components/stats/chart-card", () => ({
  ChartCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module("@deadlock-mods/ui/icons", () => ({ ChevronRight: () => <svg /> }));

const { RecentMatches } = await import("./recent-matches");

it("renders an unscored match neutrally while retaining its played stats", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  const entry = matchHistoryEntrySchema.parse({
    account_id: 1,
    match_id: 123,
    hero_id: 15,
    start_time: 1_700_000_000,
    player_team: 0,
    match_result: 1,
    player_match_outcome: 5,
    player_kills: 8,
    player_deaths: 2,
    player_assists: 4,
  });

  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <RecentMatches heroesById={new Map()} matches={[entry]} />
      </MemoryRouter>
    </I18nextProvider>,
  );

  expect(html).toContain('title="Not scored"');
  expect(html).toContain("0W 0L");
  expect(html).toContain("color:var(--viz-muted)");
  expect(html).toContain("8/2/4");
  expect(html).not.toContain('title="Loss"');
});
