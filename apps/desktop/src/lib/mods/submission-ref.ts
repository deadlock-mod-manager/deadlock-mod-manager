import type { SubmissionRef } from "@/types/generated/SubmissionRef";
import type { SubmissionType } from "@/types/generated/SubmissionType";

const GAMEBANANA_ID_PATTERN = /^[1-9]\d*$/;
const LOCAL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const matchesEntireValue = (pattern: RegExp, value: string): boolean =>
  pattern.exec(value)?.[0] === value;

const SLUG_PREFIX: Record<SubmissionType, string> = {
  mod: "",
  sound: "snd-",
  wip: "wip-",
};
const PREFIXED_TYPES = ["sound", "wip"] as const;

/** Parses numeric Mod IDs, snd- Sound IDs, wip- WIP IDs, or local- UUIDs; returns null for invalid slugs. */
export function parseSubmissionSlug(slug: string): SubmissionRef | null {
  if (matchesEntireValue(GAMEBANANA_ID_PATTERN, slug)) {
    return {
      provider: "gamebanana",
      submissionType: "mod",
      submissionId: slug,
    };
  }

  for (const submissionType of PREFIXED_TYPES) {
    const prefix = SLUG_PREFIX[submissionType];
    const submissionId = slug.startsWith(prefix)
      ? slug.slice(prefix.length)
      : null;
    if (
      submissionId &&
      matchesEntireValue(GAMEBANANA_ID_PATTERN, submissionId)
    ) {
      return {
        provider: "gamebanana",
        submissionType,
        submissionId,
      };
    }
  }

  const localId = slug.startsWith("local-") ? slug.slice(6) : null;
  if (localId && matchesEntireValue(LOCAL_ID_PATTERN, localId)) {
    return {
      provider: "local",
      submissionType: "mod",
      submissionId: localId,
    };
  }

  return null;
}

/** Returns a validated slug, lowercasing local UUIDs, or null for unsupported identities. */
export function serializeSubmissionRef(
  submission: SubmissionRef,
): string | null {
  if (submission.provider === "gamebanana") {
    if (!matchesEntireValue(GAMEBANANA_ID_PATTERN, submission.submissionId)) {
      return null;
    }
    return `${SLUG_PREFIX[submission.submissionType]}${submission.submissionId}`;
  }

  if (
    submission.submissionType !== "mod" ||
    !matchesEntireValue(LOCAL_ID_PATTERN, submission.submissionId)
  ) {
    return null;
  }

  return `local-${submission.submissionId.toLowerCase()}`;
}

/** Extracts a canonical identity from an identity-prefixed filename, or null if absent. */
export function extractSubmissionSlugFromFilename(
  filename: string,
): string | null {
  const basename = filename.split(/[\\/]/).pop() || filename;
  const separatorIndex = basename.indexOf("_");
  if (separatorIndex < 1) return null;

  const slug = basename.slice(0, separatorIndex);
  const submission = parseSubmissionSlug(slug);
  return submission ? serializeSubmissionRef(submission) : null;
}
