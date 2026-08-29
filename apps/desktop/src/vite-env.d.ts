/// <reference types="vite/client" />

interface EyeDropperConstructor {
  new (): {
    open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
  };
}

interface Window {
  EyeDropper?: EyeDropperConstructor;
}

interface File {
  /** Native path supplied by Tauri/WebView drag-and-drop implementations. */
  readonly path?: string;
}
