import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { contentMods, contentRoutes } from "./content-fixtures";
import type { FixtureRoute } from "./fixture-server";
import { readPersistedDocument } from "./observations";
import { REPOSITORY_ROOT, type CreatedWorld } from "./world";

export const legacyCatalogRoutes = async () => {
  const base = await contentRoutes();
  return (origin: string): FixtureRoute[] => [
    {
      method: "GET",
      path: "/apiv11/Mod/Categories",
      query: { _idGameRow: "20948" },
      status: 200,
      body: JSON.stringify([
        { _idRow: 33154, _sName: "Model Replacement", _nCategoryCount: 1 },
        { _idRow: 33295, _sName: "Skins", _nCategoryCount: 1 },
      ]),
    },
    ...["Sound", "Wip"].map(
      (kind): FixtureRoute => ({
        method: "GET",
        path: `/apiv11/${kind}/Categories`,
        query: { _idGameRow: "20948" },
        status: 200,
        body: "[]",
      }),
    ),
    {
      method: "GET",
      path: "/apiv11/Mod/Categories",
      query: { _idCategoryRow: "33154" },
      status: 200,
      body: JSON.stringify([
        { _idRow: 44691, _sName: "NPCs", _nCategoryCount: 1 },
      ]),
    },
    {
      method: "GET",
      path: "/apiv11/Mod/Categories",
      query: { _idCategoryRow: "44691" },
      status: 200,
      body: JSON.stringify([
        { _idRow: 44458, _sName: "Walker", _nCategoryCount: 0 },
      ]),
    },
    {
      method: "GET",
      path: "/apiv11/Mod/Categories",
      query: { _idCategoryRow: "33295" },
      status: 200,
      body: JSON.stringify([
        { _idRow: 920010, _sName: "Infernus", _nCategoryCount: 1 },
      ]),
    },
    {
      method: "GET",
      path: "/apiv11/Mod/Categories",
      query: { _idCategoryRow: "920010" },
      status: 200,
      body: JSON.stringify([
        { _idRow: 920011, _sName: "Faithful", _nCategoryCount: 0 },
      ]),
    },
    ...base(origin).map((route) => {
      const body = route.body.toString();
      if (route.path === "/apiv11/Mod/Index") {
        const index = z
          .object({
            _aMetadata: z.json(),
            _aRecords: z.array(z.record(z.string(), z.json())),
          })
          .parse(JSON.parse(body));
        for (const record of index["_aRecords"]) {
          if (record["_idRow"] === Number(contentMods[1].id)) {
            record["_aRootCategory"] = { _idRow: 33295, _sName: "Skins" };
            record["_aSubCategory"] = { _idRow: 920011, _sName: "Faithful" };
          }
          if (record["_idRow"] !== Number(contentMods[0].id)) continue;
          record["_aRootCategory"] = {
            _idRow: 33154,
            _sName: "Model Replacement",
          };
          record["_aSubCategory"] = { _idRow: 44458, _sName: "Walker" };
        }
        route.body = JSON.stringify(index);
        return route;
      }
      if (route.path === "/Core/Item/Data") {
        const rows = z.array(z.array(z.json())).parse(JSON.parse(body));
        for (const row of rows) {
          if (row[0] === contentMods[1].name) row[2] = "Faithful";
          if (row[0] !== contentMods[0].name) continue;
          row[2] = "Walker";
          row[3] = "Model Replacement";
        }
        route.body = JSON.stringify(rows);
        return route;
      }
      if (route.path === `/apiv11/Mod/${contentMods[0].id}/ProfilePage`) {
        const profile = z.record(z.string(), z.json()).parse(JSON.parse(body));
        delete profile["_aRootCategory"];
        profile["_aSuperCategory"] = { _idRow: 44691, _sName: "NPCs" };
        profile["_aCategory"] = { _idRow: 44458, _sName: "Walker" };
        route.body = JSON.stringify(profile);
        return route;
      }
      if (route.path === `/apiv11/Mod/${contentMods[1].id}/ProfilePage`) {
        const profile = z.record(z.string(), z.json()).parse(JSON.parse(body));
        profile["_aRootCategory"] = { _idRow: 33295, _sName: "Skins" };
        profile["_aSuperCategory"] = { _idRow: 920010, _sName: "Infernus" };
        profile["_aCategory"] = { _idRow: 920011, _sName: "Faithful" };
        route.body = JSON.stringify(profile);
        return route;
      }
      return route;
    }),
  ];
};

export const prepareLegacyCatalog = async (world: CreatedWorld) => {
  const database = new DatabaseSync(
    path.join(world.configuration.roots.appData, "gamebanana-catalog.db"),
  );
  try {
    for (const migration of [
      "20260830000000_create_catalog",
      "20260830000100_add_update_cache",
      "20260910000000_add_preview_images",
    ]) {
      database.exec(
        await readFile(
          path.join(
            REPOSITORY_ROOT,
            "apps/desktop/src-tauri/migrations/gamebanana_catalog",
            migration,
            "up.sql",
          ),
          "utf8",
        ),
      );
    }
    database.exec(`
      ALTER TABLE submission ADD COLUMN audio_url TEXT;
      ALTER TABLE submission ADD COLUMN author_remote_id TEXT;
      CREATE TABLE __diesel_schema_migrations (
        version VARCHAR(50) PRIMARY KEY NOT NULL,
        run_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO __diesel_schema_migrations(version) VALUES
        ('20260830000000'), ('20260830000100'), ('20260910000000'), ('20260916000000');
      INSERT INTO sync_state(key, value) VALUES ('e2e_legacy_marker', 'keep-existing-catalog');
    `);
    const cached = contentMods[0];
    database
      .prepare(`INSERT INTO submission (
      provider, submission_type, submission_id, slug, name, profile_url, category, hero,
      is_hydrated, has_files, audio_url, author_remote_id
    ) VALUES ('gamebanana', 'mod', ?, ?, ?, ?, 'Skins', 'Infernus', 1, 1, ?, '930001')`)
      .run(
        cached.id,
        cached.id,
        cached.name,
        `https://gamebanana.com/mods/${cached.id}`,
        "https://example.com/legacy-preview.mp3",
      );
    const snapshot = "e2e-pre-category-snapshot";
    const now = String(Math.floor(Date.now() / 1000));
    const state = database.prepare(
      "INSERT INTO sync_state(key, value) VALUES (?, ?)",
    );
    for (const key of [
      "last_full_sync_at",
      "last_incremental_at",
      "last_incomplete_snapshot_at",
    ]) {
      state.run(key, now);
    }
    state.run("snapshot_with_invalid_records", snapshot);
    for (const version of [
      "preview_images_v1",
      "bulk_hydration_v3",
      "thumbnails_v1",
      "author_remote_id_v1",
      "category_path_v1",
      "category_path_snapshot_v1",
    ]) {
      state.run(version, "1");
    }
    database
      .prepare("UPDATE submission SET last_seen_snapshot = ? WHERE slug = ?")
      .run(snapshot, cached.id);
    database
      .prepare(`INSERT INTO sync_cursor (submission_type, next_page, snapshot_id, snapshot_complete)
      VALUES ('mod', 2, ?, 1), ('sound', 1, ?, 0)`)
      .run(snapshot, snapshot);
  } finally {
    database.close();
  }
  const persisted = z
    .object({ state: z.record(z.string(), z.json()), version: z.number() })
    .parse(await readPersistedDocument(world.directory));
  persisted.state.nsfwSettings = {
    hideNSFW: false,
    disableBlur: false,
    blurStrength: 16,
    showLikelyNSFW: false,
    rememberPerItemOverrides: true,
  };
  await writeFile(
    path.join(world.configuration.roots.appData, "state.json"),
    JSON.stringify({ "local-config": JSON.stringify(persisted) }),
  );
};

export const assertUpgradedCatalog = (appData: string) => {
  const database = new DatabaseSync(
    path.join(appData, "gamebanana-catalog.db"),
    { readOnly: true },
  );
  try {
    const versions = z
      .array(z.object({ version: z.string() }))
      .parse(
        database
          .prepare(
            "SELECT version FROM __diesel_schema_migrations ORDER BY version",
          )
          .all(),
      )
      .map((row) => row.version);
    assert.deepEqual(versions, [
      "20260830000000",
      "20260830000100",
      "20260910000000",
      "20261003000000",
      "20261004000000",
      "20261005000000",
      "20261005000100",
      "20261007000000",
      "20261010000000",
      "20261107000000",
      "20261108000000",
      "20261111000000",
    ]);
    const marker = z
      .object({ value: z.string() })
      .parse(
        database
          .prepare(
            "SELECT value FROM sync_state WHERE key = 'e2e_legacy_marker'",
          )
          .get(),
      );
    assert.equal(
      marker.value,
      "keep-existing-catalog",
      "Upgrade must preserve the existing database",
    );
    const rows = z
      .array(z.object({ slug: z.string(), name: z.string(), tags: z.string() }))
      .parse(
        database
          .prepare(
            "SELECT slug, name, tags FROM submission WHERE is_tombstoned = 0 ORDER BY slug",
          )
          .all(),
      );
    assert.deepEqual(
      rows,
      contentMods.map((mod) => ({ slug: mod.id, name: mod.name, tags: "[]" })),
    );
    const world = z
      .object({ category: z.string(), category_path: z.string() })
      .parse(
        database
          .prepare(
            "SELECT category, category_path FROM submission WHERE slug = ?",
          )
          .get(contentMods[0].id),
      );
    assert.equal(world.category, "Model Replacement");
    assert.deepEqual(
      z
        .array(z.object({ key: z.string(), name: z.string() }))
        .parse(JSON.parse(world.category_path)),
      [
        { key: "mod:33154", name: "Model Replacement" },
        { key: "mod:44691", name: "NPCs" },
        { key: "mod:44458", name: "Walker" },
      ],
    );
    const backfill = z
      .object({ value: z.string() })
      .parse(
        database
          .prepare(
            "SELECT value FROM sync_state WHERE key = 'category_path_v2'",
          )
          .get(),
      );
    assert.equal(
      backfill.value,
      "1",
      "The category backfill must complete despite the old incomplete-sync cooldown",
    );
    const skin = z
      .object({
        category: z.string(),
        category_path: z.string(),
        hero: z.string().nullable(),
      })
      .parse(
        database
          .prepare(
            "SELECT category, category_path, hero FROM submission WHERE slug = ?",
          )
          .get(contentMods[1].id),
      );
    assert.equal(skin.category, "Skins");
    assert.equal(skin.hero, "Infernus");
    assert.deepEqual(
      z
        .array(z.object({ key: z.string(), name: z.string() }))
        .parse(JSON.parse(skin.category_path)),
      [
        { key: "mod:33295", name: "Skins" },
        { key: "mod:920010", name: "Infernus" },
        { key: "mod:920011", name: "Faithful" },
      ],
    );
  } finally {
    database.close();
  }
};
