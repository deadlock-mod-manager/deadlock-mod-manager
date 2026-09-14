import { ValidationError } from "@deadlock-mods/common";
import type { PolicyIdentity } from "@deadlock-mods/database";

export const parsePolicyIdentity = (input: string): PolicyIdentity => {
  const slug = /^(snd-)?([1-9]\d*)$/.exec(input.trim());
  if (slug?.[2]) {
    return {
      provider: "gamebanana",
      submissionType: slug[1] ? "sound" : "mod",
      submissionId: slug[2],
    };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ValidationError("Invalid GameBanana ID or URL format");
  }
  const host = url.hostname.toLowerCase();
  const match = url.pathname.match(/^\/(mods|sounds)\/([1-9]\d*)\/?$/i);
  if (
    url.protocol !== "https:" ||
    (host !== "gamebanana.com" && !host.endsWith(".gamebanana.com")) ||
    !match
  ) {
    throw new ValidationError("Invalid GameBanana ID or URL format");
  }
  return {
    provider: "gamebanana",
    submissionType: match[1]?.toLowerCase() === "sounds" ? "sound" : "mod",
    submissionId: match[2] ?? "",
  };
};
