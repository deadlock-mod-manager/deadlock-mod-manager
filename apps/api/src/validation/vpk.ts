import { z } from "zod";

export const AnalyseHashesInputSchema = z
  .object({
    sha256: z.string().optional(),
    contentSignature: z.string(),
    fastHash: z.string().optional(),
    fileSize: z.number().optional(),
    merkleRoot: z.string().optional(),
  })
  .refine(
    (data) => {
      return Object.values(data).some((value) => value !== undefined);
    },
    {
      message: "At least one hash must be provided",
    },
  );

export const AnalyseVPKInputSchema = z.object({
  vpk: z.file(),
});
