import { db, ModRepository } from "@deadlock-mods/database";
import type { ServerRequiredMod } from "@deadlock-mods/shared";
import { toModDto } from "@deadlock-mods/shared";
import { logger as mainLogger } from "../lib/logger";

const logger = mainLogger.child().withContext({
  service: "server-mods-resolver",
});

export interface ResolvedRequirement {
  name: string;
  provider: ServerRequiredMod["provider"];
  url: string;
  version?: string;
  resolved: boolean;
  remoteId?: string;
  mod?: ReturnType<typeof toModDto>;
  reason?: "unknown_scheme" | "not_in_database" | "custom_provider";
}

// GameBanana submission URLs may use any category segment (e.g. `mods`, `sounds`,
// `maps`, `skins`, `wips`), e.g. `https://gamebanana.com/mods/616792` or
// `https://gamebanana.com/sounds/12345`.
const GAMEBANANA_URL_RE =
  /^https?:\/\/(?:www\.)?gamebanana\.com\/[a-z]+\/(\d+)\/?$/i;

const extractGamebananaId = (url: string): string | null => {
  const m = url.trim().match(GAMEBANANA_URL_RE);
  return m ? m[1] : null;
};

export class ServerModsResolver {
  private static instance: ServerModsResolver | null = null;
  private readonly modRepository: ModRepository;

  private constructor() {
    this.modRepository = new ModRepository(db);
  }

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

    const remoteIds = new Set<string>();
    const lookup = new Map<string, string | null>();
    for (const req of required) {
      if (req.provider !== "gamebanana") {
        lookup.set(req.id, null);
        continue;
      }
      const id = extractGamebananaId(req.url);
      lookup.set(req.id, id);
      if (id) remoteIds.add(id);
    }

    const mods =
      remoteIds.size > 0
        ? await this.modRepository.findByRemoteIds(Array.from(remoteIds))
        : [];
    const modByRemoteId = new Map(mods.map((m) => [m.remoteId, m]));

    const resolved: ResolvedRequirement[] = required.map((req) => {
      const base = {
        name: req.id,
        provider: req.provider,
        url: req.url,
        version: req.version,
      };

      if (req.provider === "custom") {
        return {
          ...base,
          resolved: false,
          reason: "custom_provider",
        };
      }

      const remoteId = lookup.get(req.id) ?? null;
      if (!remoteId) {
        return {
          ...base,
          resolved: false,
          reason: "unknown_scheme",
        };
      }
      const mod = modByRemoteId.get(remoteId);
      if (!mod) {
        return {
          ...base,
          resolved: false,
          remoteId,
          reason: "not_in_database",
        };
      }
      return {
        ...base,
        resolved: true,
        remoteId,
        mod: toModDto(mod),
      };
    });

    logger
      .withMetadata({
        total: required.length,
        resolved: resolved.filter((r) => r.resolved).length,
      })
      .debug("Resolved required mods");

    return {
      resolved,
      installed: [],
      missing: resolved.filter((r) => r.resolved),
    };
  }
}
