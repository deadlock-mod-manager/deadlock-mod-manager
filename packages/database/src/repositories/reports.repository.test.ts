import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import * as schema from "../schema";
import { type ReportClearTarget, ReportRepository } from "./reports.repository";

const testDatabaseUrl = process.env.REPORTS_TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("clearing reports for moderation", () => {
  const databaseName = `reports_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: testDatabaseUrl });
  let pool: Pool;
  let repository: ReportRepository;
  let databaseCreated = false;

  beforeAll(async () => {
    if (!testDatabaseUrl)
      throw new Error("An explicit reports test server is required");
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    const url = new URL(testDatabaseUrl);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString() });
    repository = new ReportRepository(drizzle(pool, { schema }));
    await pool.query(`
      CREATE TABLE mod (id text PRIMARY KEY, remote_id text, name text, author text, is_audio boolean DEFAULT false);
      CREATE TABLE report (
        id text PRIMARY KEY, mod_id text REFERENCES mod(id), provider text,
        submission_type text, submission_id text, mod_name text, mod_author text,
        reporter_hardware_id text, discord_message_id text,
        created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
      );
    `);
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE report, mod;
      INSERT INTO mod (id, remote_id, name, author) VALUES
        ('mod_legacy', '688091', 'Legacy mod', 'Author_%'),
        ('sound_legacy', 'snd-688091', 'Legacy sound', 'Other Author');
      INSERT INTO report (id, mod_id) VALUES
        ('legacy', 'mod_legacy'), ('legacy_sound', 'sound_legacy');
      INSERT INTO report (id, provider, submission_type, submission_id, mod_name, mod_author) VALUES
        ('modern', 'gamebanana', 'mod', '688091', 'Modern mod', 'AUTHOR_%'),
        ('modern_other_mod', 'gamebanana', 'mod', '123', 'Another mod', 'Author_%'),
        ('modern_sound', 'gamebanana', 'sound', '688091', 'Sound', 'Other Author'),
        ('similar_name', 'gamebanana', 'mod', '456', 'Unrelated mod', 'Author_123'),
        ('partial_name', 'gamebanana', 'mod', '789', 'Unrelated mod', 'Author_% Extra');
    `);
  });

  afterAll(async () => {
    await pool?.end();
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  });

  it("clears modern and legacy reports for a mod while preserving sounds with the same ID", async () => {
    const deleted = await repository.clearForModeration({
      kind: "submission",
      identity: {
        provider: "gamebanana",
        submissionType: "mod",
        submissionId: "688091",
      },
    });
    expect(deleted.map((report) => report.id).sort()).toEqual([
      "legacy",
      "modern",
    ]);
    expect(await repository.findById("modern_sound")).not.toBeNull();
    expect(await repository.findById("legacy_sound")).not.toBeNull();
    expect(await repository.findById("modern_other_mod")).not.toBeNull();
  });

  it("clears sounds without clearing mods with the same numeric ID", async () => {
    const deleted = await repository.clearForModeration({
      kind: "submission",
      identity: {
        provider: "gamebanana",
        submissionType: "sound",
        submissionId: "688091",
      },
    });
    expect(deleted.map((report) => report.id).sort()).toEqual([
      "legacy_sound",
      "modern_sound",
    ]);
    expect(await repository.findById("modern")).not.toBeNull();
    expect(await repository.findById("legacy")).not.toBeNull();
  });

  it("matches exact author names case insensitively across legacy and detached reports", async () => {
    const deleted = await repository.clearForModeration({
      kind: "author",
      authorName: "author_%",
    });
    expect(deleted.map((report) => report.id).sort()).toEqual([
      "legacy",
      "modern",
      "modern_other_mod",
    ]);
    expect(await repository.findById("similar_name")).not.toBeNull();
    expect(await repository.findById("partial_name")).not.toBeNull();
    expect(await repository.findById("modern_sound")).not.toBeNull();
  });

  it("finds every author mod even after all report rows are gone", async () => {
    await pool.query("DELETE FROM report");
    expect(
      await repository.findModsForModeration({
        kind: "author",
        authorName: "AUTHOR_%",
      }),
    ).toEqual([{ id: "mod_legacy", slug: "688091" }]);
    expect(
      await repository.findModsForModeration({
        kind: "author",
        authorName: "Author",
      }),
    ).toEqual([]);
  });

  it("finds sounds separately from mods for moderation totals", async () => {
    expect(
      await repository.findModsForModeration({
        kind: "submission",
        identity: {
          provider: "gamebanana",
          submissionType: "sound",
          submissionId: "688091",
        },
      }),
    ).toEqual([{ id: "sound_legacy", slug: "snd-688091" }]);
  });

  it("does not interpret SQL syntax in author names", async () => {
    expect(
      await repository.clearForModeration({
        kind: "author",
        authorName: "' OR true --",
      }),
    ).toEqual([]);
    expect((await pool.query("SELECT id FROM report")).rowCount).toBe(7);
  });

  it("returns no deleted reports for an unmatched target or a repeated clear", async () => {
    const target: ReportClearTarget = {
      kind: "author",
      authorName: "Missing Author",
    };
    expect(await repository.clearForModeration(target)).toEqual([]);
    const author: ReportClearTarget = {
      kind: "author",
      authorName: "Author_%",
    };
    await repository.backfillLegacyIdentities();
    const deleted = await repository.clearForModeration(author);
    expect(deleted.find((report) => report.id === "legacy")).toMatchObject({
      provider: "gamebanana",
      submissionType: "mod",
      submissionId: "688091",
    });
    expect(await repository.clearForModeration(author)).toEqual([]);
  });
});
