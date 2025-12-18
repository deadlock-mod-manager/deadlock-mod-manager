import { desc, eq } from "@deadlock-mods/database";
import type { Database } from "../client";
import type { NewProfile, Profile } from "../schema/profiles";
import { profiles } from "../schema/profiles";

export class ProfileRepository {
  constructor(private readonly db: Database) {}

  async findAll(): Promise<Profile[]> {
    return await this.db
      .select()
      .from(profiles)
      .orderBy(desc(profiles.updatedAt));
  }

  async findById(id: string): Promise<Profile | null> {
    const result = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async findByContentHash(contentHash: string): Promise<Profile | null> {
    const result = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.contentHash, contentHash))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  }

  async create(profile: NewProfile): Promise<Profile> {
    const result = await this.db.insert(profiles).values(profile).returning();
    return result[0] as Profile;
  }

  async update(id: string, profile: Partial<NewProfile>): Promise<Profile> {
    const result = await this.db
      .update(profiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return result[0] as Profile;
  }
}
