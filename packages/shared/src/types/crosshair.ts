import type { z } from "zod";
import type { crosshairConfigSchema } from "../schemas/crosshair.schemas";

export type CrosshairConfig = z.infer<typeof crosshairConfigSchema>;
