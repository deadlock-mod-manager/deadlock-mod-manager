import { EntityNotFoundError, mapDrizzleError } from "@deadlock-mods/common";
import { and, count, eq, lt, sum } from "drizzle-orm";
import { err, ok } from "neverthrow";
import { mirroredFiles, type NewMirroredFile } from "../schema/mirrored-files";
import { BaseRepository } from "./base";

export class MirroredFileRepository extends BaseRepository {
  async create(mirroredFile: NewMirroredFile) {
    try {
      const [result] = await this.db
        .insert(mirroredFiles)
        .values(mirroredFile)
        .returning();

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to create mirrored file");
      return err(mapDrizzleError(error));
    }
  }

  async update(id: string, mirroredFile: Partial<NewMirroredFile>) {
    try {
      const [result] = await this.db
        .update(mirroredFiles)
        .set(mirroredFile)
        .where(eq(mirroredFiles.id, id))
        .returning();

      if (!result) {
        return err(new EntityNotFoundError("mirrored file", id));
      }
      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to update mirrored file");
      return err(mapDrizzleError(error));
    }
  }

  async findByModIdAndFileId(modId: string, fileId: string) {
    try {
      const result = await this.db.query.mirroredFiles.findFirst({
        where: and(
          eq(mirroredFiles.modId, modId),
          eq(mirroredFiles.modDownloadId, fileId),
        ),
      });
      if (!result) {
        return err(
          new EntityNotFoundError("mirrored file", `${modId}-${fileId}`),
        );
      }
      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find mirrored file");
      return err(mapDrizzleError(error));
    }
  }

  async findAllWithModDownloads() {
    try {
      const result = await this.db.query.mirroredFiles.findMany({
        with: {
          modDownload: true,
        },
      });
      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to find mirrored files with mod downloads");
      return err(mapDrizzleError(error));
    }
  }

  async findUnusedFiles(retentionDays: number) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.db
        .select()
        .from(mirroredFiles)
        .where(lt(mirroredFiles.lastDownloadedAt, cutoffDate));

      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find unused files");
      return err(mapDrizzleError(error));
    }
  }

  async updateLastValidated(id: string) {
    try {
      const [result] = await this.db
        .update(mirroredFiles)
        .set({
          lastValidated: new Date(),
        })
        .where(eq(mirroredFiles.id, id))
        .returning();

      if (!result) {
        return err(new EntityNotFoundError("mirrored file", id));
      }
      return ok(result);
    } catch (error) {
      this.logger
        .withError(error)
        .error("Failed to update last validated timestamp");
      return err(mapDrizzleError(error));
    }
  }

  async deleteById(id: string) {
    try {
      await this.db.delete(mirroredFiles).where(eq(mirroredFiles.id, id));
      return ok(true);
    } catch (error) {
      this.logger.withError(error).error("Failed to delete mirrored file");
      return err(mapDrizzleError(error));
    }
  }

  async markAsStale(id: string) {
    try {
      const [result] = await this.db
        .update(mirroredFiles)
        .set({
          isStale: true,
          lastValidated: new Date(),
        })
        .where(eq(mirroredFiles.id, id))
        .returning();

      if (!result) {
        return err(new EntityNotFoundError("mirrored file", id));
      }
      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to mark file as stale");
      return err(mapDrizzleError(error));
    }
  }

  async findAll() {
    try {
      const result = await this.db.select().from(mirroredFiles);
      return ok(result);
    } catch (error) {
      this.logger.withError(error).error("Failed to find all mirrored files");
      return err(mapDrizzleError(error));
    }
  }

  async getTotalStorage() {
    try {
      const result = await this.db
        .select({
          totalSize: sum(mirroredFiles.fileSize),
          count: count(),
        })
        .from(mirroredFiles);

      const totalSize = Number(result[0]?.totalSize ?? 0);
      const fileCount = Number(result[0]?.count ?? 0);

      return ok({ totalSize, count: fileCount });
    } catch (error) {
      this.logger.withError(error).error("Failed to get total storage");
      return err(mapDrizzleError(error));
    }
  }
}
