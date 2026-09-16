import { ProviderError } from "@deadlock-mods/common";
import type { NewModAuthor } from "@deadlock-mods/database";
import { z } from "zod";
import { GAME_BANANA_BASE_URL } from "@/providers/game-banana/constants";
import { buildModAuthor } from "@/providers/game-banana/utils";

const memberProfileSchema = z
  .object({
    _idRow: z.number().int().positive(),
    _sName: z.string().min(1),
    _sProfileUrl: z.string().url(),
    _sAvatarUrl: z.string().url(),
    _sHdAvatarUrl: z.string().optional(),
    _sUpicUrl: z.string().optional(),
    _sSigUrl: z.string().optional(),
    _sUserTitle: z.string().optional(),
    _tsJoinDate: z.number().int().positive().optional(),
    _nSubscriberCount: z.number().int().nonnegative().optional(),
    _bIsPrivate: z.boolean().optional(),
    _bIsBanned: z.boolean().optional(),
  })
  .passthrough();

const submissionIndexSchema = z.object({
  _aRecords: z.array(
    z.object({
      _aSubmitter: z.object({ _idRow: z.number().int().positive() }),
    }),
  ),
});

const hasDeadlockSubmission = async (
  model: "Mod" | "Sound",
  remoteId: string,
  fetcher: typeof fetch,
): Promise<boolean> => {
  const url = new URL(`${GAME_BANANA_BASE_URL}/${model}/Index`);
  url.searchParams.set("_nPerpage", "1");
  url.searchParams.set("_aFilters[Generic_Game]", "20948");
  url.searchParams.set("_aFilters[Generic_Submitter]", remoteId);
  const response = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new ProviderError(
      `GameBanana ${model.toLowerCase()} index request failed (${response.status})`,
    );
  }
  const result = submissionIndexSchema.safeParse(await response.json());
  if (!result.success) return false;
  const { _aRecords: records } = result.data;
  return records.some(
    ({ _aSubmitter: { _idRow: submitterId } }) =>
      submitterId.toString() === remoteId,
  );
};

export const fetchGameBananaMember = async (
  remoteId: string,
  fetcher: typeof fetch = fetch,
): Promise<NewModAuthor | null> => {
  const hasDeadlockContent =
    (await hasDeadlockSubmission("Mod", remoteId, fetcher)) ||
    (await hasDeadlockSubmission("Sound", remoteId, fetcher));
  if (!hasDeadlockContent) return null;

  const response = await fetcher(
    `${GAME_BANANA_BASE_URL}/Member/${remoteId}/ProfilePage`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ProviderError(
      `GameBanana member request failed (${response.status})`,
    );
  }

  const result = memberProfileSchema.safeParse(await response.json());
  if (!result.success) return null;
  const {
    _idRow: idRow,
    _bIsPrivate: isPrivate,
    _bIsBanned: isBanned,
  } = result.data;
  if (
    idRow.toString() !== remoteId ||
    isPrivate === true ||
    isBanned === true
  ) {
    return null;
  }

  return buildModAuthor(result.data) ?? null;
};
