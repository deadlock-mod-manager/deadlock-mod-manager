import { expect, it } from "bun:test";
import {
  matchMetadataSchema,
  matchHistoryEntrySchema,
} from "@/lib/validation/stats-api";
import { matchScoring } from "./match-scoring";
import { matchStatus, summarize } from "./derive";

const match = matchMetadataSchema.parse({
  match_info: {
    match_id: 133901798,
    duration_s: 2757,
    winning_team: 1,
    players: [
      {
        account_id: 1,
        hero_id: 13,
        team: 0,
        player_match_outcome: 5,
        abandon_match_time_s: 0,
      },
      {
        account_id: 2,
        hero_id: 15,
        team: 0,
        player_match_outcome: 3,
        abandon_match_time_s: 2459,
      },
      {
        account_id: 3,
        hero_id: 4,
        team: 1,
        player_match_outcome: 1,
        abandon_match_time_s: 2100,
      },
    ],
  },
}).match_info;

const me = match.players[0];
if (!me) throw new Error("Missing test player");

it("reads non-score and the teammate's departure from metadata without history", () => {
  expect(matchScoring(match, me, undefined)).toEqual({
    status: "notScored",
    teammates: [{ accountId: 2, heroId: 15, time: 2459 }],
  });
});

it("distinguishes the player's own departure from a non-scored result", () => {
  expect(
    matchScoring(match, { ...me, abandon_match_time_s: 2000 }, undefined),
  ).toEqual({ status: "abandoned", time: 2000 });
});

it("does not invent a teammate cause from a penalty or a zero departure time", () => {
  const noDeparture = {
    ...match,
    players: match.players.map((p) => ({ ...p, abandon_match_time_s: 0 })),
  };
  expect(matchScoring(noDeparture, me, undefined)).toEqual({
    status: "notScored",
    teammates: [],
  });
});

it("does not label every penalized player as abandoned", () => {
  expect(
    matchScoring(match, { ...me, player_match_outcome: 3 }, undefined),
  ).toEqual({ status: "loss" });
});

it("uses a known history departure when metadata has no timestamp", () => {
  const history = matchHistoryEntrySchema.parse({
    match_id: match.match_id,
    hero_id: 13,
    start_time: 1,
    player_team: 0,
    match_result: 1,
    player_match_outcome: 3,
    abandoned_time_s: 2459,
  });
  expect(matchScoring(match, me, history)).toEqual({
    status: "abandoned",
    time: 2459,
  });
  expect(matchStatus(history)).toBe("abandoned");
  expect(summarize([history]).losses).toBe(1);
});

it("retains missing scoring fields as unknown instead of creating an abandon", () => {
  const old = matchMetadataSchema.parse({
    match_info: {
      match_id: 1,
      winning_team: 1,
      players: [{ account_id: 1, hero_id: 13, team: 0 }],
    },
  }).match_info;
  const player = old.players[0];
  if (!player) throw new Error("Missing test player");
  expect(matchScoring(old, player, undefined)).toEqual({ status: "loss" });
});
