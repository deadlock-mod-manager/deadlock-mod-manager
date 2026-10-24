import { and, count, desc, eq, sql } from "@deadlock-mods/database";
import type { Database } from "../client";
import type {
  NewProfileBackupRow,
  ProfileBackupRow,
} from "../schema/profile-backups";
import { profileBackups } from "../schema/profile-backups";

type ProfileBackupFields = Pick<
  NewProfileBackupRow,
  | "name"
  | "deviceName"
  | "modCount"
  | "skippedLocalModCount"
  | "contentHash"
  | "payload"
>;

const summaryColumns = {
  id: profileBackups.id,
  name: profileBackups.name,
  deviceName: profileBackups.deviceName,
  modCount: profileBackups.modCount,
  skippedLocalModCount: profileBackups.skippedLocalModCount,
  contentHash: profileBackups.contentHash,
  revision: profileBackups.revision,
  createdAt: profileBackups.createdAt,
  updatedAt: profileBackups.updatedAt,
};

export class ProfileBackupRepository {
  constructor(private readonly db: Database) {}

  async listForUser(userId: string) {
    return await this.db
      .select(summaryColumns)
      .from(profileBackups)
      .where(eq(profileBackups.userId, userId))
      .orderBy(desc(profileBackups.updatedAt));
  }

  async countForUser(userId: string): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(profileBackups)
      .where(eq(profileBackups.userId, userId));
    return result[0]?.value ?? 0;
  }

  async findForUser(
    id: string,
    userId: string,
  ): Promise<ProfileBackupRow | null> {
    const result = await this.db
      .select()
      .from(profileBackups)
      .where(and(eq(profileBackups.id, id), eq(profileBackups.userId, userId)))
      .limit(1);
    return result[0] ?? null;
  }

  async create(
    userId: string,
    fields: ProfileBackupFields,
  ): Promise<ProfileBackupRow> {
    const result = await this.db
      .insert(profileBackups)
      .values({ ...fields, userId })
      .returning();
    return result[0] as ProfileBackupRow;
  }

  /** Returns null when the backup is missing or has moved past `expectedRevision`. */
  async updateAtRevision(
    id: string,
    userId: string,
    expectedRevision: number,
    fields: ProfileBackupFields,
  ): Promise<ProfileBackupRow | null> {
    const result = await this.db
      .update(profileBackups)
      .set({
        ...fields,
        revision: sql`${profileBackups.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(profileBackups.id, id),
          eq(profileBackups.userId, userId),
          eq(profileBackups.revision, expectedRevision),
        ),
      )
      .returning();
    return result[0] ?? null;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(profileBackups)
      .where(and(eq(profileBackups.id, id), eq(profileBackups.userId, userId)))
      .returning({ id: profileBackups.id });
    return result.length > 0;
  }
}
