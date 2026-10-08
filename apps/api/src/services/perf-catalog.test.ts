import { describe, expect, it } from "bun:test";
import { loadCatalog } from "@deadlock-mods/perf-catalog";
import { catalogEtag, etagMatches, perfCatalogResponse } from "./perf-catalog";

const catalog = loadCatalog();
const etag = catalogEtag(catalog.version);

describe("perfCatalogResponse", () => {
  it("serves the catalog with its version as the entity tag", () => {
    const response = perfCatalogResponse(undefined, catalog);

    expect(response.status).toBe(200);
    expect(response.headers.ETag).toBe(`"${catalog.version}"`);
    expect(response.headers["Cache-Control"]).toBe("public, max-age=3600");
    expect(response.status === 200 && response.body.version).toBe(
      catalog.version,
    );
  });

  it("answers 304 without a body when the client has this version", () => {
    const response = perfCatalogResponse(etag, catalog);

    expect(response.status).toBe(304);
    expect("body" in response).toBe(false);
    expect(response.headers.ETag).toBe(etag);
  });

  it("serves the catalog again when the client has an older version", () => {
    expect(perfCatalogResponse('"2000.01.01-1"', catalog).status).toBe(200);
  });
});

describe("etagMatches", () => {
  it("accepts weak tags, lists and the wildcard", () => {
    expect(etagMatches(`W/${etag}`, etag)).toBe(true);
    expect(etagMatches(`"other", ${etag}`, etag)).toBe(true);
    expect(etagMatches("*", etag)).toBe(true);
  });

  it("rejects a missing header and other tags", () => {
    expect(etagMatches(undefined, etag)).toBe(false);
    expect(etagMatches('"other"', etag)).toBe(false);
  });
});
