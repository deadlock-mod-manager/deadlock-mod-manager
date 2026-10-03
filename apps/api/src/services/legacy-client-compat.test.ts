import { describe, expect, it } from "bun:test";
import type { CachedVPK, Mod } from "@deadlock-mods/database";
import { z } from "zod";
import {
  type LegacyModLookup,
  legacyModIdentity,
  resolveLegacyModId,
  withLegacyVpkMods,
} from "./legacy-client-compat";

// Mirrors `HashAnalysisResponse` in released desktop builds
// (apps/desktop/src-tauri/src/mod_manager/addon_analyzer.rs before v2), whose
// serde structs reject a response missing any of these fields.
const legacyMatchedVpkSchema = z.object({
  id: z.string(),
  mod: z.object({
    id: z.string(),
    remoteId: z.string(),
    name: z.string(),
    author: z.string(),
  }),
});
const legacyHashAnalysisResponseSchema = z.array(
  z.object({
    matchedVpk: legacyMatchedVpkSchema,
    match: z.object({
      certainty: z.number().int().min(0).max(255),
      matchType: z.string(),
      alternativeMatches: z.array(legacyMatchedVpkSchema).optional(),
    }),
  }),
);

const catalogMod = (overrides: Partial<Mod>): Mod =>
  ({
    id: "mod_legacy",
    remoteId: "123",
    name: "Legacy mod",
    author: "Legacy author",
    isAudio: false,
    ...overrides,
  }) as Mod;

const vpkRow = (overrides: Partial<CachedVPK>): CachedVPK =>
  ({
    id: "vpk_1",
    modId: null,
    provider: null,
    submissionType: null,
    submissionId: null,
    sha256: "sha",
    ...overrides,
  }) as CachedVPK;

const lookup = (mods: Mod[]): LegacyModLookup => ({
  findById: (id) => Promise.resolve(mods.find((mod) => mod.id === id) ?? null),
  findBySubmissionIdentity: (submissionType, submissionId) =>
    Promise.resolve(
      mods.find(
        (mod) =>
          legacyModIdentity(mod)?.submissionType === submissionType &&
          legacyModIdentity(mod)?.submissionId === submissionId,
      ) ?? null,
    ),
});

describe("legacyModIdentity", () => {
  it("maps catalog remote IDs onto GameBanana identities", () => {
    expect(legacyModIdentity(catalogMod({}))).toEqual({
      provider: "gamebanana",
      submissionType: "mod",
      submissionId: "123",
    });
    expect(
      legacyModIdentity(catalogMod({ remoteId: "snd-7" }))?.submissionType,
    ).toBe("sound");
    expect(
      legacyModIdentity(catalogMod({ remoteId: "7", isAudio: true })),
    ).toMatchObject({ submissionType: "sound", submissionId: "7" });
  });
});

describe("resolveLegacyModId", () => {
  const mods = lookup([catalogMod({})]);

  it("resolves internal catalog IDs sent by released desktop builds", async () => {
    expect(await resolveLegacyModId("mod_legacy", mods)).toMatchObject({
      submissionType: "mod",
      submissionId: "123",
    });
  });

  it("ignores slugs and unknown catalog IDs", async () => {
    expect(await resolveLegacyModId("123", mods)).toBeNull();
    expect(await resolveLegacyModId("mod_missing", mods)).toBeNull();
  });
});

describe("withLegacyVpkMods", () => {
  const mods = lookup([
    catalogMod({}),
    catalogMod({ id: "mod_sound", remoteId: "snd-9", name: "Sound" }),
  ]);

  it("produces responses released desktop builds can deserialize", async () => {
    const result = await withLegacyVpkMods(
      {
        matchedVpk: vpkRow({ modId: "mod_legacy" }),
        match: {
          certainty: 90,
          matchType: "contentSignature",
          alternativeMatches: [
            vpkRow({
              id: "vpk_2",
              provider: "gamebanana",
              submissionType: "sound",
              submissionId: "9",
            }),
            vpkRow({
              id: "vpk_3",
              provider: "gamebanana",
              submissionType: "mod",
              submissionId: "404",
            }),
          ],
        },
      },
      mods,
    );
    const [parsed] = legacyHashAnalysisResponseSchema.parse(
      JSON.parse(JSON.stringify([result])),
    );
    expect(parsed.matchedVpk.mod).toEqual({
      id: "mod_legacy",
      remoteId: "123",
      name: "Legacy mod",
      author: "Legacy author",
    });
    expect(parsed.match.alternativeMatches?.map((m) => m.mod)).toEqual([
      {
        id: "mod_sound",
        remoteId: "snd-9",
        name: "Sound",
        author: "Legacy author",
      },
      { id: "404", remoteId: "404", name: "404", author: "" },
    ]);
  });

  it("looks each catalog mod up once per response", async () => {
    let calls = 0;
    const counting: LegacyModLookup = {
      ...mods,
      findById: (id) => {
        calls++;
        return mods.findById(id);
      },
    };
    const reupload = vpkRow({ modId: "mod_legacy" });
    await withLegacyVpkMods(
      {
        matchedVpk: reupload,
        match: { alternativeMatches: [reupload, reupload, reupload] },
      },
      counting,
    );
    expect(calls).toBe(1);
  });

  it("leaves results without a match untouched", async () => {
    expect(await withLegacyVpkMods({ vpk: "parsed" }, mods)).toEqual({
      vpk: "parsed",
      matchedVpk: undefined,
      match: undefined,
    });
  });
});
