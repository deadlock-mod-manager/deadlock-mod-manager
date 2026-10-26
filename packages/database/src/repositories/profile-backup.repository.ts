import { and, count, desc, eq, sql } from "@deadlock-mods/database";
import type { Database } from "../client";
import type {
  NewProfileBackupRow,
  ProfileBackupRow,
} from "../schema/profile-backups";
import { user } from "../schema/auth";
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

  /** Returns null when the user already keeps `limit` backups. */
  async createWithinLimit(
    userId: string,
    fields: ProfileBackupFields,
    limit: number,
  ): Promise<ProfileBackupRow | null> {
    return await this.db.transaction(async (transaction) => {
      // Locking the user row serializes concurrent creates, so two saves can't
      // both pass the count check.
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .for("update");
      const [existing] = await transaction
        .select({ value: count() })
        .from(profileBackups)
        .where(eq(profileBackups.userId, userId));
      if ((existing?.value ?? 0) >= limit) {
        return null;
      }
      const [created] = await transaction
        .insert(profileBackups)
        .values({ ...fields, userId })
        .returning();
      return created ?? null;
    });
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
