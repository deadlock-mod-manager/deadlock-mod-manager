import { z } from "zod";

export const CreateReportInputSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
  type: z
    .enum(["broken", "outdated", "malicious", "inappropriate", "other"])
    .default("broken"),
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

export const UpdateReportStatusInputSchema = z.object({
  id: z.string().min(1, "Report ID is required"),
  status: z.enum(["unverified", "verified", "dismissed"]),
  verifiedBy: z.string().optional(),
  dismissedBy: z.string().optional(),
  dismissalReason: z
    .string()
    .max(500, "Dismissal reason must be less than 500 characters")
    .optional(),
});

export const GetReportsByModInputSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
});

export const GetReportCountsInputSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
});

export const GetRecentReportsInputSchema = z.object({
  limit: z.number().min(1).max(100).default(50),
});

export const ReportResponseSchema = z.object({
  id: z.string(),
  modId: z.string(),
  type: z.enum(["broken", "outdated", "malicious", "inappropriate", "other"]),
  status: z.enum(["unverified", "verified", "dismissed"]),
  reason: z.string(),
  description: z.string().optional(),
  verifiedBy: z.string().optional(),
  verifiedAt: z.string().optional(),
  dismissedBy: z.string().optional(),
  dismissedAt: z.string().optional(),
  dismissalReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ReportWithModResponseSchema = ReportResponseSchema.extend({
  modName: z.string(),
  modAuthor: z.string(),
});

export const ReportCountsResponseSchema = z.object({
  total: z.number(),
  verified: z.number(),
  unverified: z.number(),
  dismissed: z.number(),
});

export const CreateReportResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["success", "error"]),
  error: z.string().optional(),
});

export const UpdateReportStatusResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
