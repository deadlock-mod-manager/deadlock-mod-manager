/// <reference types="vite/client" />

interface EyeDropperConstructor {
  new (): {
    open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
  };
}

interface Window {
  EyeDropper?: EyeDropperConstructor;
}
