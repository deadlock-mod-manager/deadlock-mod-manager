import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../client";
import type { Mod, ModAuthor, NewModAuthor } from "../schema/mods";
import { modAuthors, mods } from "../schema/mods";

export interface ModAuthorProfile {
  author: ModAuthor;
  mods: Mod[];
}

export class ModAuthorRepository {
  constructor(private readonly db: Database) {}

  async findProfileById(id: string): Promise<ModAuthorProfile | null> {
    const [authors, authorMods] = await Promise.all([
      this.db.select().from(modAuthors).where(eq(modAuthors.id, id)).limit(1),
      this.db
        .select()
        .from(mods)
        .where(
          and(
            eq(mods.modAuthorId, id),
            eq(mods.isBlacklisted, false),
            eq(mods.isTrashed, false),
          ),
        )
        .orderBy(desc(mods.remoteUpdatedAt)),
    ]);
    const author = authors[0];
    return author ? { author, mods: authorMods } : null;
  }

  async upsert(author: NewModAuthor): Promise<ModAuthor> {
    const [result] = await this.db
      .insert(modAuthors)
      .values(author)
      .onConflictDoUpdate({
        target: [modAuthors.provider, modAuthors.remoteId],
        set: {
          name: author.name,
          profileUrl: author.profileUrl,
          avatarUrl: author.avatarUrl,
          hdAvatarUrl: author.hdAvatarUrl,
          upicUrl: author.upicUrl,
          signatureUrl: author.signatureUrl,
          title: author.title,
          joinedAt: author.joinedAt,
          subscriberCount: author.subscriberCount,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }
}
