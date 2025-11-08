import { z } from "zod";

export const AnnouncementStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const AnnouncementCategorySchema = z.enum([
  "maintenance",
  "downtime",
  "info",
]);

export const AnnouncementDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  iconUrl: z.string().nullable(),
  linkUrl: z.string().nullable(),
  linkLabel: z.string().nullable(),
  category: AnnouncementCategorySchema,
  status: AnnouncementStatusSchema,
  authorId: z.string(),
  publishedAt: z.date().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
});

export const CreateAnnouncementSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be less than 200 characters"),
  content: z
    .string()
    .min(1, "Content is required")
    .max(10000, "Content must be less than 10000 characters"),
  iconUrl: z
    .union([z.string().url("Icon URL must be a valid URL"), z.literal("")])
    .optional(),
  linkUrl: z
    .union([z.string().url("Link URL must be a valid URL"), z.literal("")])
    .optional(),
  linkLabel: z
    .string()
    .max(50, "Link label must be less than 50 characters")
    .optional(),
  category: AnnouncementCategorySchema.default("info"),
  status: AnnouncementStatusSchema.default("draft"),
});

export const UpdateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(10000).optional(),
  iconUrl: z
    .union([z.string().url("Icon URL must be a valid URL"), z.literal("")])
    .optional()
    .nullable()
    .transform((val) => (val === "" ? null : val)),
  linkUrl: z
    .union([z.string().url("Link URL must be a valid URL"), z.literal("")])
    .optional()
    .nullable()
    .transform((val) => (val === "" ? null : val)),
  linkLabel: z
    .string()
    .max(50, "Link label must be less than 50 characters")
    .optional()
    .nullable(),
  category: AnnouncementCategorySchema.optional(),
  status: AnnouncementStatusSchema.optional(),
});

export const AnnouncementIdParamSchema = z.object({
  id: z.string().min(1, "Announcement ID is required"),
});

export const AnnouncementsListResponseSchema = z.array(AnnouncementDtoSchema);
export const AnnouncementResponseSchema = AnnouncementDtoSchema;

export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof UpdateAnnouncementSchema>;
export type AnnouncementIdParam = z.infer<typeof AnnouncementIdParamSchema>;
