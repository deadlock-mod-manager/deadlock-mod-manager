/** biome-ignore-all lint/suspicious/noExplicitAny: polyfill for oRPC */
import { File } from "node:buffer";

if (typeof globalThis.File === "undefined") {
  globalThis.File = File as any;
}
