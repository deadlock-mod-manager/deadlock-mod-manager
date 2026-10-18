import { NotFoundError } from "@deadlock-mods/common";
import type { Mod } from "@deadlock-mods/database";
import { logger } from "../lib/logger";

export abstract class Provider<T> {
  // Do we even need the T  ?
  protected logger: typeof logger;

  constructor() {
    this.logger = logger.child().withContext({
      provider: this.constructor.name,
    });
  }

  abstract synchronize(): Promise<void>;
  abstract createMod(
    mod: T,
    source: string,
  ): Promise<{
    mod: Mod | undefined;
    filesChanged: boolean;
    contentChanged: boolean;
    handledAsTrashed?: boolean;
    /**
     * Why the profile produced no payload: "not_found" for a 404, or
     * "unavailable" when private, withheld, or for another game.
     */
    skipped?: string;
  }>;
  abstract getModDownload<D>(remoteId: string): Promise<D>;
}

type ProviderConstructor<T> = {
  new (...args: never[]): Provider<T>;
};

class ProviderRegistry {
  private readonly providers: Map<string, ProviderConstructor<unknown>> =
    new Map();

  registerProvider(name: string, provider: ProviderConstructor<unknown>) {
    this.providers.set(name, provider);
  }

  getProvider<T>(name: string): Provider<T> {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new NotFoundError(`Provider ${name} not found`);
    }
    return new provider() as Provider<T>;
  }
}

export const providerRegistry = new ProviderRegistry();
