import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { mods } from "./mods";
import { timestamps } from "./shared/timestamps";

export const reportStatusEnum = pgEnum("report_status", [
  "unverified",
  "verified",
  "dismissed",
]);

export const reportTypeEnum = pgEnum("report_type", [
  "broken",
  "outdated",
  "malicious",
  "inappropriate",
  "other",
]);

export const reports = pgTable(
  "report",
  {
    id: typeId("id", "report")
      .primaryKey()
      .$defaultFn(() => generateId("report").toString()),
    modId: text("mod_id")
      .notNull()
      .references(() => mods.id, { onDelete: "cascade" }),
    type: reportTypeEnum("type").notNull().default("broken"),
    status: reportStatusEnum("status").notNull().default("unverified"),
    reason: text("reason").notNull(),
    description: text("description"),
    reporterHardwareId: text("reporter_hardware_id"),
    verifiedBy: text("verified_by"), // Discord user ID or username
    verifiedAt: timestamp("verified_at", { mode: "date" }),
    dismissedBy: text("dismissed_by"), // Discord user ID or username
    dismissedAt: timestamp("dismissed_at", { mode: "date" }),
    dismissalReason: text("dismissal_reason"),
    discordMessageId: text("discord_message_id"), // For tracking Discord integration
    ...timestamps,
  },
  (table) => [
    uniqueIndex("report_mod_id_reporter_hardware_id_idx").on(
      table.modId,
      table.reporterHardwareId,
    ),
  ],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

export type ReportStatus = (typeof reportStatusEnum.enumValues)[number];
export type ReportType = (typeof reportTypeEnum.enumValues)[number];
