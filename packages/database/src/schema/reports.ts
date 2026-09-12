import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { mods } from "./mods";
import { policyProviders, policySubmissionTypes } from "./policy-rules";
import { timestamps } from "./shared/timestamps";

export const reports = pgTable(
  "report",
  {
    id: typeId("id", "report")
      .primaryKey()
      .$defaultFn(() => generateId("report").toString()),
    // Retained while the deployed API still writes internal mod IDs.
    modId: text("mod_id").references(() => mods.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: policyProviders }),
    submissionType: text("submission_type", {
      enum: policySubmissionTypes,
    }),
    submissionId: text("submission_id"),
    modName: text("mod_name"),
    modAuthor: text("mod_author"),
    reporterHardwareId: text("reporter_hardware_id"),
    discordMessageId: text("discord_message_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("report_mod_id_reporter_hardware_id_idx").on(
      table.modId,
      table.reporterHardwareId,
    ),
    index("idx_report_mod_id").on(table.modId),
    index("idx_report_identity").on(
      table.provider,
      table.submissionType,
      table.submissionId,
    ),
  ],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
