import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { policyProviders, policySubmissionTypes } from "./policy-rules";
import { timestamps } from "./shared/timestamps";

export const reports = pgTable(
  "report",
  {
    id: typeId("id", "report")
      .primaryKey()
      .$defaultFn(() => generateId("report").toString()),
    provider: text("provider", { enum: policyProviders }).notNull(),
    submissionType: text("submission_type", {
      enum: policySubmissionTypes,
    }).notNull(),
    submissionId: text("submission_id").notNull(),
    modName: text("mod_name").notNull(),
    modAuthor: text("mod_author").notNull(),
    reporterHardwareId: text("reporter_hardware_id"),
    discordMessageId: text("discord_message_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("report_identity_reporter_hardware_id_idx").on(
      table.provider,
      table.submissionType,
      table.submissionId,
      table.reporterHardwareId,
    ),
    index("idx_report_identity").on(
      table.provider,
      table.submissionType,
      table.submissionId,
    ),
  ],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
