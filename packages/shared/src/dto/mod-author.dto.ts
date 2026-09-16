import type { ModAuthor } from "@deadlock-mods/database";
import type { ModAuthorDto } from "../schemas/mod.schemas";

export const toModAuthorDto = (author: ModAuthor): ModAuthorDto => ({
  id: author.id,
  provider: author.provider,
  remoteId: author.remoteId,
  name: author.name,
  profileUrl: author.profileUrl,
  avatarUrl: author.avatarUrl,
  hdAvatarUrl: author.hdAvatarUrl,
  upicUrl: author.upicUrl,
  signatureUrl: author.signatureUrl,
  title: author.title,
  joinedAt: author.joinedAt,
  subscriberCount: author.subscriberCount,
});
