import { describe, expect, mock, test } from "bun:test";
import type {
  ModAuthor,
  ModAuthorContact,
  ModAuthorProfile,
  NewModAuthor,
} from "@deadlock-mods/database";
import { createMockLogger } from "@deadlock-mods/logging";

mock.module("@/lib/logger", () => ({ logger: createMockLogger() }));

const { resolveModAuthorProfile } = await import("./mod-author-profile");

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
  contacts: null,
  contactsFetchedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const now = new Date("2026-10-25T12:00:00Z");

const store = (
  profile: ModAuthorProfile,
  updateContacts = mock(async () => profile.author),
) => ({
  findProfileById: mock(async () => profile),
  findProfileByProviderRemoteId: mock(async () => profile),
  upsert: mock(async () => profile.author),
  updateContacts,
});

describe("resolveModAuthorProfile", () => {
  test("hydrates a missing GameBanana author before resolving the profile", async () => {
    const profile: ModAuthorProfile = { author, mods: [] };
    const findProfileByProviderRemoteId = mock(
      async (): Promise<ModAuthorProfile | null> => null,
    );
    const fetched = { ...author, contactsFetchedAt: now };
    const findProfileById = mock(async () => ({ ...profile, author: fetched }));
    const upsert = mock(async (_value: NewModAuthor) => author);
    const fetchGameBananaMember = mock(async () => author);

    const result = await resolveModAuthorProfile(
      "gamebanana:4577138",
      {
        findProfileById,
        findProfileByProviderRemoteId,
        upsert,
        updateContacts: mock(async () => fetched),
      },
      fetchGameBananaMember,
      mock(async () => []),
      now,
    );

    expect(result).toEqual({ ...profile, author: fetched });
    expect(fetchGameBananaMember).toHaveBeenCalledWith("4577138");
    expect(upsert).toHaveBeenCalledWith(author);
    expect(findProfileById).toHaveBeenCalledWith(author.id);
  });

  test("refreshes contacts that are older than a day", async () => {
    const contacts: ModAuthorContact[] = [
      { type: "discord", value: "hanturaya", url: null },
    ];
    const stale = {
      ...author,
      contactsFetchedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
    };
    const refreshed = { ...author, contacts, contactsFetchedAt: now };
    const updateContacts = mock(async () => refreshed);
    const fetchContacts = mock(async () => contacts);

    const result = await resolveModAuthorProfile(
      author.id,
      store({ author: stale, mods: [] }, updateContacts),
      mock(async () => null),
      fetchContacts,
      now,
    );

    expect(fetchContacts).toHaveBeenCalledWith(author.remoteId);
    expect(updateContacts).toHaveBeenCalledWith(author.id, contacts);
    expect(result?.author).toEqual(refreshed);
  });

  test("keeps recent contacts without asking GameBanana", async () => {
    const fresh = { ...author, contacts: [], contactsFetchedAt: now };
    const fetchContacts = mock(async () => []);

    const result = await resolveModAuthorProfile(
      author.id,
      store({ author: fresh, mods: [] }),
      mock(async () => null),
      fetchContacts,
      now,
    );

    expect(fetchContacts).not.toHaveBeenCalled();
    expect(result?.author).toEqual(fresh);
  });

  test("still returns the profile when GameBanana is unreachable", async () => {
    const profile = { author, mods: [] };

    const result = await resolveModAuthorProfile(
      author.id,
      store(profile),
      mock(async () => null),
      mock(async () => {
        throw new Error("GameBanana member request failed (503)");
      }),
      now,
    );

    expect(result).toEqual(profile);
  });
});
