import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import baselineSnapshot from "../../drizzle/meta/0053_snapshot.json";
import journal from "../../drizzle/meta/_journal.json";
import { ReportRepository } from "../repositories/reports.repository";
import * as schema from "../schema";

const migrationsFolder = fileURLToPath(
  new URL("../../drizzle/", import.meta.url),
);
const baselineEntry = journal.entries.find((entry) => entry.idx === 53);
const testDatabaseUrl = process.env.MIGRATION_TEST_DATABASE_URL;

// Uses a fresh database on the explicitly supplied test server, never DATABASE_URL.
describe.skipIf(!testDatabaseUrl)("pre-v2 migration compatibility", () => {
  const databaseName = `migration_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: testDatabaseUrl });
  let pool: Pool;
  let databaseCreated = false;

  beforeAll(async () => {
    if (!testDatabaseUrl || !baselineEntry) {
      throw new Error(
        "An explicit test server and the 0053 baseline are required",
      );
    }
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    const url = new URL(testDatabaseUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });

    // Reconstruct the affected legacy tables from the released snapshot. Other
    // tables (including pgvector tables) are not involved in this migration.
    const baseline = {
      ...baselineSnapshot,
      tables: {
        "public.mod": baselineSnapshot.tables["public.mod"],
        "public.mod_download": baselineSnapshot.tables["public.mod_download"],
        "public.report": baselineSnapshot.tables["public.report"],
        "public.vpk": baselineSnapshot.tables["public.vpk"],
        "public.rss_item": baselineSnapshot.tables["public.rss_item"],
      },
      enums: { "public.vpk_state": baselineSnapshot.enums["public.vpk_state"] },
    };
    const statements = await generateMigration(
      generateDrizzleJson({}),
      baseline,
    );
    for (const statement of statements) {
      await pool.query(statement);
    }
    await pool.query(`
      INSERT INTO mod (id, remote_id, name, remote_url, category, author,
        remote_added_at, remote_updated_at, tags, images)
      VALUES ('mod_legacy', '123', 'Legacy mod', 'https://example.com/123',
        'Skins', 'Legacy author', now(), now(), '{}', '{}');
      INSERT INTO mod_download (id, mod_id, remote_id, file, url, size)
      VALUES ('download_legacy', 'mod_legacy', '456', 'mod.vpk',
        'https://example.com/mod.vpk', 100);
      INSERT INTO report (id, mod_id, reporter_hardware_id)
      VALUES ('report_before', 'mod_legacy', 'hardware_before');
      INSERT INTO vpk (id, mod_id, mod_download_id, source_path, size_bytes,
        fast_hash, sha256, content_sig, vpk_version, file_count, scanned_at)
      VALUES ('vpk_before', 'mod_legacy', 'download_legacy', 'before.vpk',
        100, 'fast-before', 'sha-before', 'content-before', 2, 1, now());
      INSERT INTO rss_item (id, title, link, pub_date)
      VALUES ('rss_before', 'Before migration', 'https://example.com/before',
        '2026-01-01');
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id serial PRIMARY KEY, hash text NOT NULL, created_at bigint
      );
    `);
    await pool.query(
      "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
      ["released-0053-test-baseline", baselineEntry.when],
    );
    await migrate(drizzle(pool), { migrationsFolder });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
    if (databaseCreated) {
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
    await admin.end();
  });

  it("preserves pre-migration rows and supports legacy inserts and conflict targets", async () => {
    const report = await pool.query<{
      mod_id: string;
      submission_id: string | null;
    }>(`
      INSERT INTO report (id, mod_id, reporter_hardware_id)
      VALUES ('report_after', 'mod_legacy', 'hardware_after') RETURNING *
    `);
    expect(report.rows[0]).toMatchObject({
      mod_id: "mod_legacy",
      submission_id: null,
    });
    const duplicateReport = await pool.query(`
      INSERT INTO report (id, mod_id, reporter_hardware_id)
      VALUES ('report_duplicate', 'mod_legacy', 'hardware_after')
      ON CONFLICT (mod_id, reporter_hardware_id) DO NOTHING RETURNING id
    `);
    expect(duplicateReport.rowCount).toBe(0);

    await pool.query(`
      INSERT INTO vpk (id, mod_id, mod_download_id, source_path, size_bytes,
        fast_hash, sha256, content_sig, vpk_version, file_count, scanned_at)
      VALUES ('vpk_after', 'mod_legacy', 'download_legacy', 'after.vpk',
        100, 'fast-after', 'sha-after', 'content-after', 2, 1, now())
      ON CONFLICT (sha256) DO NOTHING
    `);
    const duplicateVpk = await pool.query(`
      INSERT INTO vpk (id, mod_id, source_path, size_bytes,
        fast_hash, sha256, content_sig, vpk_version, file_count, scanned_at)
      VALUES ('vpk_duplicate', 'mod_legacy', 'duplicate.vpk',
        100, 'fast-after', 'sha-after', 'content-after', 2, 1, now())
      ON CONFLICT (sha256) DO NOTHING RETURNING id
    `);
    expect(duplicateVpk.rowCount).toBe(0);
    const upsert = await pool.query<{ id: string; size_bytes: number }>(`
      INSERT INTO vpk (id, mod_id, mod_download_id, source_path, size_bytes,
        fast_hash, sha256, content_sig, vpk_version, file_count, scanned_at)
      VALUES ('vpk_source_duplicate', 'mod_legacy', 'download_legacy', 'after.vpk',
        200, 'fast-new', 'sha-new', 'content-new', 2, 1, now())
      ON CONFLICT (mod_download_id, source_path)
      DO UPDATE SET size_bytes = excluded.size_bytes RETURNING id, size_bytes
    `);
    expect(upsert.rows).toEqual([{ id: "vpk_after", size_bytes: 200 }]);
    const oldJoin = await pool.query<{ name: string }>(`
      SELECT mod.name FROM vpk JOIN mod ON mod.id = vpk.mod_id
      JOIN mod_download ON mod_download.id = vpk.mod_download_id
      WHERE vpk.id = 'vpk_before'
    `);
    expect(oldJoin.rows).toEqual([{ name: "Legacy mod" }]);
    await pool.query(`
      INSERT INTO rss_item (id, title, link, pub_date)
      VALUES ('rss_after', 'After migration', 'https://example.com/before', '2026-01-02')
      ON CONFLICT (link, source) DO UPDATE SET title = excluded.title
    `);
    const rss = await pool.query<{ title: string }>(
      "SELECT title FROM rss_item WHERE id = 'rss_before'",
    );
    expect(rss.rows).toEqual([{ title: "After migration" }]);
    const oldReport = await pool.query(
      "SELECT id FROM report WHERE id = 'report_before'",
    );
    expect(oldReport.rowCount).toBe(1);
  });

  it("keeps reporting metadata readable before the identity backfill", async () => {
    const repository = new ReportRepository(drizzle(pool, { schema }));
    const recent = await repository.getRecentReports();
    expect(
      recent.find((report) => report.id === "report_before"),
    ).toMatchObject({
      modId: "mod_legacy",
      modName: "Legacy mod",
      modAuthor: "Legacy author",
    });
    const counts = await repository.getSubmissionsWithReportCounts();
    expect(counts).toContainEqual({
      modId: "mod_legacy",
      modName: "Legacy mod",
      modAuthor: "Legacy author",
      totalReports: 2,
    });
  });

  it("preserves foreign keys and their legacy delete behavior", async () => {
    await expect(
      pool.query(`
      INSERT INTO report (id, mod_id) VALUES ('report_orphan', 'missing_mod')
    `),
    ).rejects.toMatchObject({ code: "23503" });
    await pool.query("BEGIN");
    try {
      await pool.query("DELETE FROM mod_download WHERE id = 'download_legacy'");
      const vpks = await pool.query<{ mod_download_id: string | null }>(
        "SELECT mod_download_id FROM vpk",
      );
      expect(vpks.rows.every((row) => row.mod_download_id === null)).toBe(true);
      await pool.query("DELETE FROM mod WHERE id = 'mod_legacy'");
      expect((await pool.query("SELECT id FROM report")).rowCount).toBe(0);
      expect((await pool.query("SELECT id FROM vpk")).rowCount).toBe(0);
    } finally {
      await pool.query("ROLLBACK");
    }
  });

  it("runs the normal migration runner again without reapplying migrations", async () => {
    const before = await pool.query(
      "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id",
    );
    await migrate(drizzle(pool), { migrationsFolder });
    const after = await pool.query(
      "SELECT * FROM drizzle.__drizzle_migrations ORDER BY id",
    );
    expect(after.rows).toEqual(before.rows);
    expect(after.rowCount).toBe(
      1 + journal.entries.filter((entry) => entry.idx > 53).length,
    );
  });
});

it("keeps all pending migrations free of destructive legacy changes", async () => {
  for (const entry of journal.entries.filter(
    (migration) => migration.idx > 53,
  )) {
    const sql = await readFile(`${migrationsFolder}/${entry.tag}.sql`, "utf8");
    expect(sql).not.toMatch(
      /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX)|SET\s+NOT\s+NULL/i,
    );
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE)\b/i);
  }
});
