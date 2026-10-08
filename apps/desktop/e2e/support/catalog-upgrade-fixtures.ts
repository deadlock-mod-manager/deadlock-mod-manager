import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { contentMods } from "./content-fixtures";
import { readPersistedDocument } from "./observations";
import { REPOSITORY_ROOT, type CreatedWorld } from "./world";

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
  } finally {
    database.close();
  }
};
