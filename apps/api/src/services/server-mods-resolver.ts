import {
  db,
  type PolicyRule,
  PolicyRuleRepository,
} from "@deadlock-mods/database";
import type { ServerRequiredMod } from "@deadlock-mods/shared";
import {
  type DirectGameBananaSubmission,
  fetchGameBananaSubmission,
  type GameBananaIdentity,
  gameBananaIdentitySlug,
} from "./gamebanana-submission";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 256;
const RESOLVE_CONCURRENCY = 4;
const MAX_REQUIREMENTS = 50;
// Kept below the server's idle timeout so a slow provider yields partial
// results instead of a closed connection.
const RESOLVE_DEADLINE_MS = 8_000;

export interface ResolvedRequirement {
  name: string;
  provider: ServerRequiredMod["provider"];
  url: string;
  version?: string;
  resolved: boolean;
  remoteId?: string;
  mod?: DirectGameBananaSubmission["mod"];
  reason?:
    | "unknown_scheme"
    | "not_found"
    | "provider_failure"
    | "policy_blocked"
    | "too_many_requirements"
    | "custom_provider"
    | "timed_out";
}

export const parseGameBananaSubmissionUrl = (
  rawUrl: string,
): GameBananaIdentity | null => {
  try {
    const url = new URL(rawUrl.trim());
    if (
      url.protocol !== "https:" ||
      !["gamebanana.com", "www.gamebanana.com"].includes(url.hostname) ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || !/^[1-9]\d*$/.test(segments[1] ?? "")) {
      return null;
    }
    const submissionType =
      segments[0]?.toLowerCase() === "mods"
        ? "mod"
        : segments[0]?.toLowerCase() === "sounds"
          ? "sound"
          : null;
    if (!submissionType) return null;
    return {
      provider: "gamebanana",
      submissionType,
      submissionId: segments[1]!,
    };
  } catch {
    return null;
  }
};

const applyPolicy = (
  submission: DirectGameBananaSubmission,
  rules: PolicyRule[],
): DirectGameBananaSubmission | null => {
  const matching = rules.filter(
    (rule) =>
      rule.active &&
      rule.provider === submission.identity.provider &&
      rule.submissionType === submission.identity.submissionType &&
      rule.submissionId === submission.identity.submissionId,
  );
  if (
    matching.some((rule) =>
      ["hidden", "blacklisted", "takedown", "emergency_disable"].includes(
        rule.kind,
      ),
    )
  ) {
    return null;
  }
  const corrected = structuredClone(submission);
  for (const rule of matching) {
    if (rule.kind !== "metadata_correction" || !rule.correction) continue;
    const correction = rule.correction;
    if (correction.name !== undefined) corrected.mod.name = correction.name;
    if (correction.description !== undefined) {
      corrected.mod.description = correction.description;
    }
    if (correction.category !== undefined) {
      corrected.mod.category = correction.category;
    }
    if (correction.hero !== undefined) corrected.mod.hero = correction.hero;
    if (correction.isMap !== undefined) corrected.mod.isMap = correction.isMap;
    if (correction.isAudio !== undefined) {
      corrected.mod.isAudio = correction.isAudio;
    }
    if (correction.isNSFW !== undefined) {
      corrected.mod.isNSFW = correction.isNSFW;
    }
    if (correction.isObsolete !== undefined) {
      corrected.mod.isObsolete = correction.isObsolete;
    }
    if (correction.metadata !== undefined) {
      corrected.mod.metadata = {
        ...corrected.mod.metadata,
        ...correction.metadata,
      };
    }
    if (correction.tags !== undefined) corrected.mod.tags = correction.tags;
  }
  return corrected;
};

const requirementBase = (requirement: ServerRequiredMod) => ({
  name: requirement.id,
  provider: requirement.provider,
  url: requirement.url,
  version: requirement.version,
});

const DEADLINE_REACHED = Symbol("resolve-deadline");

type FetchSubmission = (
  identity: GameBananaIdentity,
) => Promise<DirectGameBananaSubmission | null>;
type LoadPolicy = () => Promise<PolicyRule[]>;

const policyRepository = new PolicyRuleRepository(db);
const loadPolicyRules = (): Promise<PolicyRule[]> => policyRepository.listAll();

export class ServerModsResolver {
  private static instance: ServerModsResolver | null = null;
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: DirectGameBananaSubmission | null }
  >();

  constructor(
    private readonly fetchSubmission: FetchSubmission = fetchGameBananaSubmission,
    private readonly loadPolicy: LoadPolicy = loadPolicyRules,
    private readonly deadlineMs: number = RESOLVE_DEADLINE_MS,
  ) {}

  static getInstance(): ServerModsResolver {
    if (!ServerModsResolver.instance) {
      ServerModsResolver.instance = new ServerModsResolver();
    }
    return ServerModsResolver.instance;
  }

  async resolve(required: ServerRequiredMod[]): Promise<{
    resolved: ResolvedRequirement[];
    installed: ResolvedRequirement[];
    missing: ResolvedRequirement[];
  }> {
    if (required.length === 0) {
      return { resolved: [], installed: [], missing: [] };
    }
    const rules = await this.loadPolicy();
    const bounded = required.slice(0, MAX_REQUIREMENTS);
    const resolved = await this.resolveBounded(bounded, rules);
    for (const requirement of required.slice(MAX_REQUIREMENTS)) {
      resolved.push({
        ...requirementBase(requirement),
        resolved: false,
        reason: "too_many_requirements",
      });
    }
    return {
      resolved,
      installed: [],
      missing: resolved.filter((item) => !item.resolved),
    };
  }

  /**
   * Resolves requirements with a fixed number of workers pulling from one
   * shared iterator, so a slow provider lookup occupies a single slot instead
   * of stalling a whole batch. Results start out as `timed_out` and are
   * overwritten as each lookup lands, so a deadline miss returns partial
   * results instead of holding the response open past the server's idle
   * timeout.
   */
  private async resolveBounded(
    bounded: ServerRequiredMod[],
    rules: PolicyRule[],
  ): Promise<ResolvedRequirement[]> {
    const results: ResolvedRequirement[] = bounded.map((requirement) => ({
      ...requirementBase(requirement),
      resolved: false,
      reason: "timed_out",
    }));
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<typeof DEADLINE_REACHED>((resolveDeadline) => {
      timer = setTimeout(() => {
        expired = true;
        resolveDeadline(DEADLINE_REACHED);
      }, this.deadlineMs);
    });

    const queue = bounded.entries();
    const worker = async (): Promise<void> => {
      for (const [index, requirement] of queue) {
        if (expired) break;
        const outcome = await Promise.race([
          this.resolveRequirement(requirement, rules),
          deadline,
        ]);
        if (outcome === DEADLINE_REACHED) break;
        results[index] = outcome;
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(RESOLVE_CONCURRENCY, bounded.length) },
          () => worker(),
        ),
      );
    } finally {
      clearTimeout(timer);
    }
    return results;
  }

  private async resolveRequirement(
    requirement: ServerRequiredMod,
    rules: PolicyRule[],
  ): Promise<ResolvedRequirement> {
    const base = requirementBase(requirement);
    if (requirement.provider === "custom") {
      return { ...base, resolved: false, reason: "custom_provider" };
    }
    const identity = parseGameBananaSubmissionUrl(requirement.url);
    if (!identity) {
      return { ...base, resolved: false, reason: "unknown_scheme" };
    }
    const remoteId = gameBananaIdentitySlug(identity);
    try {
      const submission = await this.getSubmission(identity);
      if (!submission) {
        return { ...base, resolved: false, remoteId, reason: "not_found" };
      }
      const allowed = applyPolicy(submission, rules);
      if (!allowed) {
        return {
          ...base,
          resolved: false,
          remoteId,
          reason: "policy_blocked",
        };
      }
      return { ...base, resolved: true, remoteId, mod: allowed.mod };
    } catch {
      return { ...base, resolved: false, remoteId, reason: "provider_failure" };
    }
  }

  private async getSubmission(
    identity: GameBananaIdentity,
  ): Promise<DirectGameBananaSubmission | null> {
    const key = gameBananaIdentitySlug(identity);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(key);
    const value = await this.fetchSubmission(identity);
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }
}
