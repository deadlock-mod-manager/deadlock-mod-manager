import { and, desc, eq, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { Mod, ModAuthor, NewModAuthor } from "../schema/mods";
import { modAuthors, mods } from "../schema/mods";

export interface ModAuthorProfile {
  author: ModAuthor;
  mods: Mod[];
}

export class ModAuthorRepository {
  constructor(private readonly db: Database) {}

  findProfileById(id: string): Promise<ModAuthorProfile | null> {
    return this.findProfile(eq(modAuthors.id, id));
  }

  findProfileByProviderRemoteId(
    provider: string,
    remoteId: string,
  ): Promise<ModAuthorProfile | null> {
    return this.findProfile(
      eq(modAuthors.provider, provider),
      eq(modAuthors.remoteId, remoteId),
    );
  }

  private async findProfile(
    ...conditions: SQL[]
  ): Promise<ModAuthorProfile | null> {
    const profile = await this.db.query.modAuthors.findFirst({
      where: and(...conditions),
      with: {
        mods: {
          where: and(eq(mods.isBlacklisted, false), eq(mods.isTrashed, false)),
          orderBy: desc(mods.remoteUpdatedAt),
        },
      },
    });
    if (!profile) return null;
    const { mods: authorMods, ...author } = profile;
    return { author, mods: authorMods };
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
