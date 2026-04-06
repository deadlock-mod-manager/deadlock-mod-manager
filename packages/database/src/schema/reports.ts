import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { mods } from "./mods";
import { timestamps } from "./shared/timestamps";

export const reports = pgTable(
  "report",
  {
    id: typeId("id", "report")
      .primaryKey()
      .$defaultFn(() => generateId("report").toString()),
    modId: text("mod_id")
      .notNull()
      .references(() => mods.id, { onDelete: "cascade" }),
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
  ],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
