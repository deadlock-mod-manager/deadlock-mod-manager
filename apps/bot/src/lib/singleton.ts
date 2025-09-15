export abstract class Singleton {
  private static instances = new Map<new () => Singleton, Singleton>();

  protected constructor() {}

  public static getInstance<T extends Singleton>(this: new () => T): T {
    if (!Singleton.instances.has(this)) {
      Singleton.instances.set(this, new this());
    }
    return Singleton.instances.get(this)! as T;
  }
}
