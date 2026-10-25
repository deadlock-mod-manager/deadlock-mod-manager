import type {
  ModAuthorContact,
  ModAuthorProfile,
  ModAuthorRepository,
  NewModAuthor,
} from "@deadlock-mods/database";
import { logger } from "@/lib/logger";
import { parseModAuthorLookup } from "@/lib/mod-author-lookup";

type ModAuthorProfileStore = Pick<
  ModAuthorRepository,
  | "findProfileById"
  | "findProfileByProviderRemoteId"
  | "upsert"
  | "updateContacts"
>;

type FetchGameBananaMember = (remoteId: string) => Promise<NewModAuthor | null>;
type FetchGameBananaContacts = (
  remoteId: string,
) => Promise<ModAuthorContact[] | null>;

const CONTACTS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const findProfile = async (
  lookupId: string,
  repository: ModAuthorProfileStore,
  fetchGameBananaMember: FetchGameBananaMember,
): Promise<ModAuthorProfile | null> => {
  const lookup = parseModAuthorLookup(lookupId);
  if (!lookup) return null;
  if (lookup.kind === "id") {
    return repository.findProfileById(lookup.id);
  }

  const existing = await repository.findProfileByProviderRemoteId(
    lookup.provider,
    lookup.remoteId,
  );
  if (existing) return existing;

  const member = await fetchGameBananaMember(lookup.remoteId);
  if (!member) return null;
  const author = await repository.upsert(member);
  return repository.findProfileById(author.id);
};

/**
 * Mod sync only sees the submitter summary, which has no contact info, so
 * contacts are read from the member profile when someone opens it. A failed
 * read keeps whatever was stored and is tried again on the next view.
 */
const withFreshContacts = async (
  profile: ModAuthorProfile,
  repository: ModAuthorProfileStore,
  fetchGameBananaContacts: FetchGameBananaContacts,
  now: Date,
): Promise<ModAuthorProfile> => {
  const { author } = profile;
  const fetchedAt = author.contactsFetchedAt?.getTime();
  if (
    author.provider !== "gamebanana" ||
    (fetchedAt !== undefined && now.getTime() - fetchedAt < CONTACTS_MAX_AGE_MS)
  ) {
    return profile;
  }

  try {
    const contacts = await fetchGameBananaContacts(author.remoteId);
    const updated = await repository.updateContacts(author.id, contacts ?? []);
    return { ...profile, author: updated };
  } catch (error) {
    logger
      .withError(error)
      .withMetadata({ authorId: author.id })
      .warn("Failed to refresh GameBanana author contacts");
    return profile;
  }
};

export const resolveModAuthorProfile = async (
  lookupId: string,
  repository: ModAuthorProfileStore,
  fetchGameBananaMember: FetchGameBananaMember,
  fetchGameBananaContacts: FetchGameBananaContacts,
  now = new Date(),
): Promise<ModAuthorProfile | null> => {
  const profile = await findProfile(
    lookupId,
    repository,
    fetchGameBananaMember,
  );
  return profile
    ? withFreshContacts(profile, repository, fetchGameBananaContacts, now)
    : null;
};
