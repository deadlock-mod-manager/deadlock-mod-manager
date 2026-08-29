import type { SubmissionRef } from "@/types/generated/SubmissionRef";

const GAMEBANANA_ID_PATTERN = /^[1-9]\d*$/;
const LOCAL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const matchesEntireValue = (pattern: RegExp, value: string): boolean =>
  pattern.exec(value)?.[0] === value;

export function parseSubmissionSlug(slug: string): SubmissionRef | null {
  if (matchesEntireValue(GAMEBANANA_ID_PATTERN, slug)) {
    return {
      provider: "gamebanana",
      submissionType: "mod",
      submissionId: slug,
    };
  }

  const soundId = slug.startsWith("snd-") ? slug.slice(4) : null;
  if (soundId && matchesEntireValue(GAMEBANANA_ID_PATTERN, soundId)) {
    return {
      provider: "gamebanana",
      submissionType: "sound",
      submissionId: soundId,
    };
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

export function serializeSubmissionRef(
  submission: SubmissionRef,
): string | null {
  if (submission.provider === "gamebanana") {
    if (!matchesEntireValue(GAMEBANANA_ID_PATTERN, submission.submissionId)) {
      return null;
    }
    return submission.submissionType === "sound"
      ? `snd-${submission.submissionId}`
      : submission.submissionId;
  }

  if (
    submission.submissionType !== "mod" ||
    !matchesEntireValue(LOCAL_ID_PATTERN, submission.submissionId)
  ) {
    return null;
  }

  return `local-${submission.submissionId}`;
}

export function extractSubmissionSlugFromFilename(
  filename: string,
): string | null {
  const basename = filename.split(/[\\/]/).pop() || filename;
  const separatorIndex = basename.indexOf("_");
  if (separatorIndex < 1) return null;

  const slug = basename.slice(0, separatorIndex);
  return parseSubmissionSlug(slug) ? slug : null;
}
