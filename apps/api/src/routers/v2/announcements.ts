import { AnnouncementRepository, db } from "@deadlock-mods/database";
import {
  AnnouncementIdParamSchema,
  AnnouncementResponseSchema,
  AnnouncementsListResponseSchema,
  CreateAnnouncementSchema,
  toAnnouncementDto,
} from "@deadlock-mods/shared";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { adminProcedure, publicProcedure } from "../../lib/orpc";

const announcementRepository = new AnnouncementRepository(db);

export const announcementsRouter = {
  listPublishedAnnouncements: publicProcedure
    .route({ method: "GET", path: "/v2/announcements" })
    .output(AnnouncementsListResponseSchema)
    .handler(async () => {
      const announcements = await announcementRepository.findPublished();
      return announcements.map(toAnnouncementDto);
    }),

  listAllAnnouncements: adminProcedure
    .route({ method: "GET", path: "/v2/announcements/admin" })
    .output(AnnouncementsListResponseSchema)
    .handler(async () => {
      const announcements = await announcementRepository.findAll();
      return announcements.map(toAnnouncementDto);
    }),

  getAnnouncement: adminProcedure
    .route({ method: "GET", path: "/v2/announcements/{id}" })
    .input(AnnouncementIdParamSchema)
    .output(AnnouncementResponseSchema)
    .handler(async ({ input }) => {
      const announcement = await announcementRepository.findById(input.id);
      if (!announcement) {
        throw new ORPCError("NOT_FOUND", {
          message: "Announcement not found",
        });
      }
      return toAnnouncementDto(announcement);
    }),

  createAnnouncement: adminProcedure
    .route({ method: "POST", path: "/v2/announcements" })
    .input(CreateAnnouncementSchema)
    .output(AnnouncementResponseSchema)
    .handler(async ({ input, context }) => {
      if (!context.session?.user) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const announcement = await announcementRepository.create({
        title: input.title,
        content: input.content,
        iconUrl: input.iconUrl || null,
        linkUrl: input.linkUrl || null,
        linkLabel: input.linkLabel || null,
        category: input.category,
        status: input.status,
        authorId: context.session.user.id,
      });

      return toAnnouncementDto(announcement);
    }),

  updateAnnouncement: adminProcedure
    .route({ method: "PUT", path: "/v2/announcements/{id}" })
    .input(
      AnnouncementIdParamSchema.extend({
        title: CreateAnnouncementSchema.shape.title.optional(),
        content: CreateAnnouncementSchema.shape.content.optional(),
        iconUrl: CreateAnnouncementSchema.shape.iconUrl.optional(),
        linkUrl: CreateAnnouncementSchema.shape.linkUrl.optional(),
        linkLabel: CreateAnnouncementSchema.shape.linkLabel.optional(),
        category: CreateAnnouncementSchema.shape.category.optional(),
        status: CreateAnnouncementSchema.shape.status.optional(),
      }),
    )
    .output(AnnouncementResponseSchema)
    .handler(async ({ input }) => {
      const { id, ...updates } = input;
      const existing = await announcementRepository.findById(id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Announcement not found",
        });
      }

      const updateData: {
        title?: string;
        content?: string;
        iconUrl?: string | null;
        linkUrl?: string | null;
        linkLabel?: string | null;
        category?: "maintenance" | "downtime" | "info";
        status?: "draft" | "published" | "archived";
      } = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.iconUrl !== undefined)
        updateData.iconUrl = updates.iconUrl || null;
      if (updates.linkUrl !== undefined)
        updateData.linkUrl = updates.linkUrl || null;
      if (updates.linkLabel !== undefined)
        updateData.linkLabel = updates.linkLabel || null;
      if (updates.category !== undefined)
        updateData.category = updates.category;
      if (updates.status !== undefined) updateData.status = updates.status;

      const announcement = await announcementRepository.update(id, updateData);
      return toAnnouncementDto(announcement);
    }),

  deleteAnnouncement: adminProcedure
    .route({ method: "DELETE", path: "/v2/announcements/{id}" })
    .input(AnnouncementIdParamSchema)
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      const existing = await announcementRepository.findById(input.id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Announcement not found",
        });
      }

      await announcementRepository.delete(input.id);
      return { success: true };
    }),

  publishAnnouncement: adminProcedure
    .route({ method: "POST", path: "/v2/announcements/{id}/publish" })
    .input(AnnouncementIdParamSchema)
    .output(AnnouncementResponseSchema)
    .handler(async ({ input }) => {
      const existing = await announcementRepository.findById(input.id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Announcement not found",
        });
      }

      const announcement = await announcementRepository.publish(input.id);
      return toAnnouncementDto(announcement);
    }),

  archiveAnnouncement: adminProcedure
    .route({ method: "POST", path: "/v2/announcements/{id}/archive" })
    .input(AnnouncementIdParamSchema)
    .output(AnnouncementResponseSchema)
    .handler(async ({ input }) => {
      const existing = await announcementRepository.findById(input.id);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", {
          message: "Announcement not found",
        });
      }

      const announcement = await announcementRepository.archive(input.id);
      return toAnnouncementDto(announcement);
    }),
};
