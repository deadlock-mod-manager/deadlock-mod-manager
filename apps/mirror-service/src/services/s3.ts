import { createHash } from "node:crypto";
import { RuntimeError } from "@deadlock-mods/common";
import { S3Client } from "bun";
import { err, ok } from "neverthrow";
import { env } from "@/lib/env";

export class S3Service {
  static #instance: S3Service | null = null;
  private readonly client: S3Client;

  private constructor() {
    this.client = new S3Client({
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
      acl: "public-read",
      endpoint: env.S3_ENDPOINT,
    });
  }

  static get instance(): S3Service {
    if (!S3Service.#instance) {
      S3Service.#instance = new S3Service();
    }
    return S3Service.#instance;
  }

  async uploadFileBuffer(key: string, content: Buffer) {
    try {
      const s3File = this.client.file(key);
      await s3File.write(content);
      return ok(s3File);
    } catch (error) {
      return err(new RuntimeError("Failed to upload file", error));
    }
  }

  async deleteFile(key: string) {
    try {
      const s3File = this.client.file(key);
      await s3File.delete();
      return ok(true);
    } catch (error) {
      return err(new RuntimeError("Failed to delete file", error));
    }
  }

  async fileExists(key: string) {
    try {
      const s3File = this.client.file(key);
      const exists = await s3File.exists();
      return ok(exists);
    } catch (error) {
      return err(new RuntimeError("Failed to check file existence", error));
    }
  }

  async getFileStat(key: string) {
    try {
      const s3File = this.client.file(key);
      const stat = await s3File.stat();
      return ok(stat);
    } catch (error) {
      return err(new RuntimeError("Failed to get file stat", error));
    }
  }

  async uploadFileStream(key: string, stream: ReadableStream) {
    const s3File = this.client.file(key);
    const writer = s3File.writer({
      retry: 3,
      queueSize: 10,
      partSize: 5 * 1024 * 1024, // 5 MB chunks
    });

    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        writer.write(value);
        await writer.flush();
      }

      await writer.end();
      return ok(s3File);
    } catch (error) {
      return err(new RuntimeError("Failed to upload file stream", error));
    } finally {
      reader.releaseLock();
    }
  }

  uploadAndStreamThrough(
    key: string,
    sourceStream: ReadableStream,
    onSuccess: (hash: string) => void,
  ): { outputStream: ReadableStream; uploadPromise: Promise<void> } {
    const [streamForS3, streamForResponse] = sourceStream.tee();
    const hash = createHash("sha256");

    const s3File = this.client.file(key);
    const writer = s3File.writer({
      retry: 3,
      queueSize: 10,
      partSize: 5 * 1024 * 1024, // 5 MB chunks
    });

    const uploadPromise = (async () => {
      const reader = streamForS3.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          hash.update(value);
          // Update the hash
          writer.write(value);
          await writer.flush();
        }
        await writer.end();
        onSuccess(hash.digest("hex"));
      } catch (error) {
        throw new RuntimeError("Failed to upload file stream", error);
      } finally {
        reader.releaseLock();
      }
    })();

    return {
      outputStream: streamForResponse,
      uploadPromise,
    };
  }

  async downloadFileStream(key: string) {
    try {
      const s3File = this.client.file(key);
      const existsResult = await this.fileExists(key);

      if (existsResult.isErr()) {
        return err(
          new RuntimeError(
            "Failed to check file existence",
            existsResult.error,
          ),
        );
      }

      if (!existsResult.value) {
        return err(new RuntimeError(`File with key '${key}' does not exist`));
      }

      return ok(s3File.stream());
    } catch (error) {
      return err(new RuntimeError("Failed to create download stream", error));
    }
  }
}
