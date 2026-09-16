import { describe, expect, mock, test } from "bun:test";
import type {
  ModAuthor,
  ModAuthorProfile,
  NewModAuthor,
} from "@deadlock-mods/database";
import { resolveModAuthorProfile } from "./mod-author-profile";

const author: ModAuthor = {
  id: "mod_author_hanturaya",
  provider: "gamebanana",
  remoteId: "4577138",
  name: "Hanturaya",
  profileUrl: "https://gamebanana.com/members/4577138",
  avatarUrl: "https://images.gamebanana.com/avatar.jpg",
  hdAvatarUrl: null,
  upicUrl: null,
  signatureUrl: null,
  title: "Bananite",
  joinedAt: 1_750_301_063,
  subscriberCount: 64,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("resolveModAuthorProfile", () => {
  test("hydrates a missing GameBanana author before resolving the profile", async () => {
    const profile: ModAuthorProfile = { author, mods: [] };
    const findProfileByProviderRemoteId = mock(
      async () => null as ModAuthorProfile | null,
    );
    const findProfileById = mock(async () => profile);
    const upsert = mock(async (_value: NewModAuthor) => author);
    const fetchGameBananaMember = mock(async () => author);

    const result = await resolveModAuthorProfile(
      "gamebanana:4577138",
      { findProfileById, findProfileByProviderRemoteId, upsert },
      fetchGameBananaMember,
    );

    expect(result).toEqual(profile);
    expect(fetchGameBananaMember).toHaveBeenCalledWith("4577138");
    expect(upsert).toHaveBeenCalledWith(author);
    expect(findProfileById).toHaveBeenCalledWith(author.id);
  });
});
