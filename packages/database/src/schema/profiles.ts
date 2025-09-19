import { pgTable } from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import { timestamps } from "./shared/timestamps";

export const profiles = pgTable("profile", {
  id: typeId("id", "profile")
    .primaryKey()
    .$defaultFn(() => generateId("profile").toString()),
  ...timestamps,
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
