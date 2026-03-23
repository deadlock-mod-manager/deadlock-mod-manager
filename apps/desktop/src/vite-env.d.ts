/// <reference types="vite/client" />

interface EyeDropperConstructor {
  new (): {
    open(): Promise<{ sRGBHex: string }>;
  };
}

interface Window {
  EyeDropper?: EyeDropperConstructor;
}
