import { z } from "zod";

export const CreateReportSchema = z.object({
  modId: z.string().min(1, "Mod ID is required"),
  reporterHardwareId: z.string().optional(),
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
export type GetReportsByModInput = z.infer<typeof GetReportsByModSchema>;
export type GetReportCountsInput = z.infer<typeof GetReportCountsSchema>;
export type GetRecentReportsInput = z.infer<typeof GetRecentReportsSchema>;
