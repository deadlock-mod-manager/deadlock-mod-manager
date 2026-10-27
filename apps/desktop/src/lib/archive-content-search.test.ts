import { expect, test } from "bun:test";
import {
  archiveContentSearchPhase,
  splitContentMatch,
} from "./archive-content-search";
import { readWorkspaceSnapshot } from "./modding-workspace";

test("content snippets use UTF-16 columns without breaking emoji and treat markup as text", () => {
  expect(splitContentMatch("😀 café <script>", 3, 7)).toEqual({
    before: "😀 ",
    match: "café",
    after: " <script>",
  });
  expect(splitContentMatch("value", 0, 0)).toEqual({
    before: "",
    match: "",
    after: "value",
  });
});

test("comparison handoff retains content search options and older views default to path search", () => {
  const old = readWorkspaceSnapshot(
    '{"source":null,"view":{"search":"needle"}}',
  );
  expect(old.view.searchMode).toBe("paths");
  const next = readWorkspaceSnapshot(
    JSON.stringify({
      ...old,
      view: {
        ...old.view,
        searchMode: "contents",
        contentCaseSensitive: true,
        contentPathFilter: ".vpcf_c",
      },
    }),
  );
  expect(next.view.searchMode).toBe("contents");
  expect(next.view.contentCaseSensitive).toBe(true);
  expect(next.view.contentPathFilter).toBe(".vpcf_c");
  expect(next.view.search).toBe("needle");
});

test("an empty first batch remains searching until the archive is exhausted", () => {
  const scan = {
    submitted: true,
    paused: false,
    pending: false,
    failed: false,
    hasMore: true,
    matchingFiles: 0,
  };
  expect(
    archiveContentSearchPhase({ ...scan, pending: true, hasMore: false }),
  ).toBe("searching");
  expect(archiveContentSearchPhase(scan)).toBe("searching");
  expect(archiveContentSearchPhase({ ...scan, hasMore: false })).toBe(
    "complete",
  );
  expect(archiveContentSearchPhase({ ...scan, submitted: false })).toBe("idle");
});

test("pause, failures and the result cap stop scanning without reporting completion", () => {
  const scan = {
    submitted: true,
    paused: false,
    pending: false,
    failed: false,
    hasMore: true,
    matchingFiles: 12,
  };
  expect(archiveContentSearchPhase({ ...scan, paused: true })).toBe("paused");
  expect(
    archiveContentSearchPhase({ ...scan, pending: true, paused: true }),
  ).toBe("paused");
  expect(archiveContentSearchPhase({ ...scan, failed: true })).toBe("error");
  expect(archiveContentSearchPhase({ ...scan, matchingFiles: 2010 })).toBe(
    "limit",
  );
  expect(
    archiveContentSearchPhase({ ...scan, matchingFiles: 2010, hasMore: false }),
  ).toBe("limit");
  expect(
    archiveContentSearchPhase({ ...scan, paused: true, hasMore: false }),
  ).toBe("complete");
  expect(
    archiveContentSearchPhase({ ...scan, matchingFiles: 2000, hasMore: false }),
  ).toBe("complete");
});
