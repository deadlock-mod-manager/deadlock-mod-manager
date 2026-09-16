import type {
  ModAuthor,
  ModAuthorProfile,
  NewModAuthor,
} from "@deadlock-mods/database";
import { parseModAuthorLookup } from "@/lib/mod-author-lookup";

export interface ModAuthorProfileStore {
  findProfileById(id: string): Promise<ModAuthorProfile | null>;
  findProfileByProviderRemoteId(
    provider: string,
    remoteId: string,
  ): Promise<ModAuthorProfile | null>;
  upsert(author: NewModAuthor): Promise<ModAuthor>;
}

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
