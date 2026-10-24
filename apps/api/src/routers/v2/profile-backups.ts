import { db, ProfileBackupRepository } from "@deadlock-mods/database";
import {
  MAX_PROFILE_BACKUPS_PER_USER,
  profileBackupIdParamSchema,
  profileBackupSchema,
  profileBackupsListResponseSchema,
  profileBackupSummarySchema,
  saveProfileBackupInputSchema,
  toProfileBackupDto,
  toProfileBackupSummaryDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { createRateLimitMiddleware, protectedProcedure } from "../../lib/orpc";

const profileBackupRepository = new ProfileBackupRepository(db);

const saveRateLimit = createRateLimitMiddleware({
  maxRequests: 60,
  windowSeconds: 600,
});

export const profileBackupsRouter = {
  listProfileBackups: protectedProcedure
    .route({ method: "GET", path: "/v2/profile-backups" })
    .output(profileBackupsListResponseSchema)
    .handler(async ({ context }) => {
      const backups = await profileBackupRepository.listForUser(
        context.session.user.id,
      );
      return backups.map(toProfileBackupSummaryDto);
    }),

  getProfileBackup: protectedProcedure
    .route({ method: "GET", path: "/v2/profile-backups/{id}" })
    .input(profileBackupIdParamSchema)
    .output(profileBackupSchema)
    .handler(async ({ input, context }) => {
      const backup = await profileBackupRepository.findForUser(
        input.id,
        context.session.user.id,
      );
      if (!backup) {
        throw new ORPCError("NOT_FOUND");
      }
      return toProfileBackupDto(backup);
    }),

  saveProfileBackup: protectedProcedure
    .use(saveRateLimit)
    .route({ method: "PUT", path: "/v2/profile-backups" })
    .input(saveProfileBackupInputSchema)
    .output(profileBackupSummarySchema)
    .handler(async ({ input, context }) => {
      const userId = context.session.user.id;
      const fields = {
        name: input.name,
        deviceName: input.deviceName,
        modCount: input.payload.profile.payload.mods.length,
        skippedLocalModCount: input.payload.skippedLocalModCount,
        contentHash: input.contentHash,
        payload: input.payload,
      };

      if (!input.id) {
        const existing = await profileBackupRepository.countForUser(userId);
        if (existing >= MAX_PROFILE_BACKUPS_PER_USER) {
          throw new ORPCError("FORBIDDEN", {
            message: `Accounts can keep up to ${MAX_PROFILE_BACKUPS_PER_USER} profile backups`,
          });
        }
        return toProfileBackupSummaryDto(
          await profileBackupRepository.create(userId, fields),
        );
      }

      if (input.expectedRevision === undefined) {
        throw new ORPCError("BAD_REQUEST", {
          message: "expectedRevision is required to update a backup",
        });
      }

      const updated = await profileBackupRepository.updateAtRevision(
        input.id,
        userId,
        input.expectedRevision,
        fields,
      );
      if (updated) {
        return toProfileBackupSummaryDto(updated);
      }

      const current = await profileBackupRepository.findForUser(
        input.id,
        userId,
      );
      if (!current) {
        throw new ORPCError("NOT_FOUND");
      }
      throw new ORPCError("CONFLICT", {
        message: "The backup was changed from another PC",
        data: { revision: current.revision },
      });
    }),

  deleteProfileBackup: protectedProcedure
    .route({ method: "DELETE", path: "/v2/profile-backups/{id}" })
    .input(profileBackupIdParamSchema)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
      const deleted = await profileBackupRepository.deleteForUser(
        input.id,
        context.session.user.id,
      );
      if (!deleted) {
        throw new ORPCError("NOT_FOUND");
      }
      return { success: true };
    }),
};
