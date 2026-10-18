import { createExtractorFromFile, UnrarError } from "node-unrar-js";
import { matchesExtensions, toSafeRelativePath } from "../../lib/archive-paths";
import type { ExtractionOptions, ExtractionResult } from "../../types/archive";

export interface RarWorkerRequest extends ExtractionOptions {
  archivePath: string;
}

export type RarWorkerResponse =
  | { ok: true; result: ExtractionResult }
  | { ok: false; error: string };

declare var self: Worker;

const describeError = (error: Error): string => {
  if (error instanceof UnrarError) {
    return error.file ? `${error.reason} (${error.file})` : error.reason;
  }
  return error.message;
};

self.addEventListener(
  "message",
  async (event: MessageEvent<RarWorkerRequest>) => {
    const { archivePath, targetDir, fileExtensions } = event.data;
    let response: RarWorkerResponse;

    try {
      const extractor = await createExtractorFromFile({
        filepath: archivePath,
        targetPath: targetDir,
        filenameTransform: toSafeRelativePath,
      });
      const { files } = extractor.extract({
        files: (header) =>
          !header.flags.directory &&
          matchesExtensions(header.name, fileExtensions),
      });

      const result: ExtractionResult = {
        extractedFiles: [],
        errors: [],
        totalBytes: 0,
      };
      for (const { fileHeader } of files) {
        result.extractedFiles.push(fileHeader.name);
        result.totalBytes += fileHeader.unpSize;
      }
      response = { ok: true, result };
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? describeError(error) : String(error),
      };
    }

    postMessage(response);
  },
);
