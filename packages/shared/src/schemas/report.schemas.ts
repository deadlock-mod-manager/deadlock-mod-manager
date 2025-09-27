import { z } from "zod";

export const ReportTypeSchema = z.enum([
  "broken",
  "outdated",
  "malicious",
  "inappropriate",
  "other",
]);

export const ReportStatusSchema = z.enum([
  "unverified",
  "verified",
  "dismissed",
]);

export const CreateReportSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
  type: ReportTypeSchema.default("broken"),
  reason: z
    .string()
    .min(5, "Reason must be at least 5 characters")
    .max(500, "Reason must be less than 500 characters"),
  description: z
    .string()
    .max(2000, "Description must be less than 2000 characters")
    .optional(),
  reporterHardwareId: z.string().optional(),
});

export const UpdateReportStatusSchema = z.object({
  status: ReportStatusSchema,
  verifiedBy: z.string().optional(),
  dismissedBy: z.string().optional(),
  dismissalReason: z
    .string()
    .max(500, "Dismissal reason must be less than 500 characters")
    .optional(),
});

export const GetReportsByModSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
});

export const GetReportCountsSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
});

export const GetRecentReportsSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
});

export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type UpdateReportStatusInput = z.infer<typeof UpdateReportStatusSchema>;
export type GetReportsByModInput = z.infer<typeof GetReportsByModSchema>;
export type GetReportCountsInput = z.infer<typeof GetReportCountsSchema>;
export type GetRecentReportsInput = z.infer<typeof GetRecentReportsSchema>;
