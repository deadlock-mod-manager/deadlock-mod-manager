import { ExtractionError } from "@deadlock-mods/common";
import { logger } from "@/lib/logger";
import type { ExtractionOptions, ExtractionResult } from "@/types/archive";
import { ArchiveExtractor } from "../archive";
import type { RarWorkerRequest, RarWorkerResponse } from "./rar-worker";

export class RarExtractor extends ArchiveExtractor {
  private static instance: RarExtractor | null = null;

  private constructor() {
    super(logger);
  }

  static getInstance(): RarExtractor {
    if (!RarExtractor.instance) {
      RarExtractor.instance = new RarExtractor();
    }
    return RarExtractor.instance;
  }

  getSupportedExtensions(): string[] {
    return [".rar"];
  }

  /**
   * node-unrar-js extracts synchronously on one process-wide WASM instance
   * whose heap never shrinks, so each archive gets its own short-lived worker.
   */
  async extractAll(
    archivePath: string,
    options: ExtractionOptions,
  ): Promise<ExtractionResult> {
    const worker = new Worker(new URL("./rar-worker.ts", import.meta.url).href);

    try {
      return await new Promise<ExtractionResult>((resolve, reject) => {
        worker.addEventListener(
          "message",
          (event: MessageEvent<RarWorkerResponse>) => {
            if (event.data.ok) {
              resolve(event.data.result);
            } else {
              reject(new ExtractionError(event.data.error));
            }
          },
        );
        worker.addEventListener("error", (event) => {
          reject(new ExtractionError(event.message));
        });
        const request: RarWorkerRequest = { archivePath, ...options };
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker, not a window
        worker.postMessage(request);
      });
    } finally {
      worker.terminate();
    }
  }
}

export const rarExtractor = RarExtractor.getInstance();
