import { expect, it } from "bun:test";
import {
  assertDownloadNetwork,
  DOWNLOAD_FILE,
  QUEUED_FILE,
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
