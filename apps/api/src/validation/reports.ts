import { z } from "zod";

export const CreateReportInputSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
  reporterHardwareId: z.string().optional(),
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
  type: z.string(),
  status: z.string(),
  reason: z.string(),
  description: z.string().optional(),
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
