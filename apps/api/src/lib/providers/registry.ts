import { Mod } from '@prisma/client'
import Logger from '../logger'

export abstract class Provider<T> {
  // Do we even need the T  ?
  protected logger: typeof Logger

  constructor() {
    this.logger = Logger.getSubLogger({
      name: this.constructor.name
    })
  }

  abstract getMods(): AsyncGenerator<T>
  abstract synchronize(): Promise<void>
  abstract createMod(mod: T): Promise<Mod>
}

interface ProviderConstructor<T> {
  new (...args: any[]): Provider<T>
}

export class ProviderRegistry {
  private providers: Map<string, ProviderConstructor<unknown>> = new Map()

  registerProvider(name: string, provider: ProviderConstructor<unknown>) {
    this.providers.set(name, provider)
  }

  getProvider<T>(name: string): Provider<T> {
    const provider = this.providers.get(name)
    if (!provider) {
      throw new Error(`Provider ${name} not found`)
    }
    return new provider() as Provider<T>
  }
}

export const providerRegistry = new ProviderRegistry()
