import { ProviderError, ValidationError } from "@deadlock-mods/common";
import type { ReportClearTarget } from "@deadlock-mods/database";
import { z } from "zod";
import { parsePolicyIdentity } from "./policy-identity";

export type ReportTarget =
  | ReportClearTarget
  | { kind: "member"; memberId: string };

export function parseReportTarget(input: string): ReportTarget {
  const target = input.trim();
  if (!target) {
    throw new ValidationError(
      "Enter a GameBanana mod URL, member URL, or exact author name.",
    );
  }
  if (/^(snd-)?[1-9]\d*$/.test(target)) {
    return { kind: "submission", identity: parsePolicyIdentity(target) };
  }

  if (
    !/^(?:[a-z][a-z\d+.-]*:\/\/|\/\/|(?:www\.)?gamebanana\.com(?:\/|$))/i.test(
      target,
    )
  ) {
    return { kind: "author", authorName: target };
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new ValidationError(
      "Enter a valid HTTPS GameBanana mod or member URL.",
    );
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (host !== "gamebanana.com" && host !== "www.gamebanana.com") ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new ValidationError(
      "Enter a valid HTTPS GameBanana mod or member URL.",
    );
  }
  const member = /^\/members\/([1-9]\d*)\/?$/i.exec(url.pathname);
  if (member?.[1]) return { kind: "member", memberId: member[1] };
  return { kind: "submission", identity: parsePolicyIdentity(target) };
}

const memberNameSchema = z.object({
  _idRow: z.number().int().positive(),
  _sName: z.string().trim().min(1),
});

export async function resolveReportTarget(
  target: ReportTarget,
  fetcher: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<ReportClearTarget> {
  if (target.kind !== "member") return target;
  const response = await fetcher(
    `https://gamebanana.com/apiv11/Member/${target.memberId}/ProfilePage`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404) {
    throw new ValidationError("That GameBanana member could not be found.");
  }
  if (!response.ok) {
    throw new ProviderError(
      `GameBanana member request failed (${response.status})`,
    );
  }
  const result = memberNameSchema.safeParse(await response.json());
  if (!result.success) {
    throw new ProviderError("GameBanana returned an invalid member profile.");
  }
  const { _idRow: memberId, _sName: authorName } = result.data;
  if (memberId.toString() !== target.memberId) {
    throw new ProviderError("GameBanana returned an invalid member profile.");
  }
  return { kind: "author", authorName };
}
