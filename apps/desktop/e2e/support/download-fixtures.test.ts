import { expect, it } from "bun:test";
import {
  assertDownloadNetwork,
  DOWNLOAD_FILE,
  QUEUED_FILE,
  payloadFor,
  segmentRanges,
} from "./download-fixtures";
import type { FixtureRequest } from "./fixture-server";

const transfer = (file: string): FixtureRequest => ({
  at: new Date(0).toISOString(),
  method: "GET",
  url: `/downloads/${file}`,
  headers: {},
  bodyBytes: 0,
  responseStatus: 200,
});

it("requires paused segments to resume within their original spans", () => {
  const initial = segmentRanges(
    payloadFor("downloads-segmented-pause").length,
  ).map((range) =>
    Object.assign(transfer(DOWNLOAD_FILE), {
      responseStatus: 206,
      headers: { range },
    }),
  );
  const resumed = initial.map((request, index) => {
    const [start, end] = request.headers.range.slice(6).split("-").map(Number);
    return {
      ...request,
      headers: { range: `bytes=${start + (index ? 65536 : 0)}-${end}` },
    };
  });
  expect(() =>
    assertDownloadNetwork("downloads-segmented-pause", [
      ...initial,
      ...resumed,
    ]),
  ).not.toThrow();
  expect(() =>
    assertDownloadNetwork("downloads-segmented-pause", [
      ...initial,
      ...initial,
    ]),
  ).toThrow();
  resumed[1].headers.range = initial[0].headers.range;
  expect(() =>
    assertDownloadNetwork("downloads-segmented-pause", [
      ...initial,
      ...resumed,
    ]),
  ).toThrow();
});

it("accepts the running transfer but rejects any request for the deleted queued mod", () => {
  const first = transfer(DOWNLOAD_FILE);
  expect(() =>
    assertDownloadNetwork("downloads-delete-queued", [first]),
  ).not.toThrow();
  expect(() =>
    assertDownloadNetwork("downloads-delete-queued", [
      first,
      transfer(QUEUED_FILE),
    ]),
  ).toThrow();
});

const segment = (range: string, responseStatus = 206): FixtureRequest => ({
  ...transfer(DOWNLOAD_FILE),
  headers: { range },
  responseStatus,
});
const planned = segmentRanges(
  payloadFor("downloads-segmented-wrong-range").length,
);

it("lets the misanswered segment stop a sibling before it asks, but not ask twice", () => {
  const fallback = transfer(DOWNLOAD_FILE);
  const check = (ranges: string[]) => () =>
    assertDownloadNetwork("downloads-segmented-wrong-range", [
      ...ranges.map((range) => segment(range)),
      fallback,
    ]);
  expect(check([planned[0], planned[1], planned[2]])).not.toThrow();
  expect(check([planned[0], planned[2], planned[2]])).toThrow();
  expect(
    check([planned[0], planned[2], planned[3].replace(/=\d+/, "=1")]),
  ).toThrow();
});

it("needs one ordinary request after a failed Range request", () => {
  const failed = segment(planned[0], 400);
  expect(() =>
    assertDownloadNetwork("downloads-segmented-range-error", [
      failed,
      transfer(DOWNLOAD_FILE),
    ]),
  ).not.toThrow();
  expect(() =>
    assertDownloadNetwork("downloads-segmented-range-error", [failed]),
  ).toThrow();
});
