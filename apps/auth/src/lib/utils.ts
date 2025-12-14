import { createHash } from "node:crypto";

export const generateHash = (data: string) => {
  return createHash("sha256").update(data).digest("hex");
};
