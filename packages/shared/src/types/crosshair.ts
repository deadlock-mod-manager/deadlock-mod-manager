import type { z } from "zod";
import { crosshairConfigSchema } from "../schemas/crosshair.schemas";

export type CrosshairConfig = z.infer<typeof crosshairConfigSchema>;

