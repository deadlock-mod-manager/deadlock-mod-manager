import type {
  ModAuthorRepository,
  ModAuthorProfile,
  NewModAuthor,
} from "@deadlock-mods/database";
import { parseModAuthorLookup } from "@/lib/mod-author-lookup";

type ModAuthorProfileStore = Pick<
  ModAuthorRepository,
  "findProfileById" | "findProfileByProviderRemoteId" | "upsert"
>;

type FetchGameBananaMember = (remoteId: string) => Promise<NewModAuthor | null>;

export const resolveModAuthorProfile = async (
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
