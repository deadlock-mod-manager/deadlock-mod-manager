import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { generateId, typeId } from "../extensions/typeid";
import type { ModOverrides } from "./mods";
import { timestamps } from "./shared/timestamps";

export const policyProviders = ["gamebanana"] as const;
export const policySubmissionTypes = ["mod", "sound"] as const;
export const policyRuleKinds = [
  "hidden",
  "blacklisted",
  "takedown",
  "metadata_correction",
  "emergency_disable",
] as const;

export type PolicyProvider = (typeof policyProviders)[number];
export type PolicySubmissionType = (typeof policySubmissionTypes)[number];
export type PolicyRuleKind = (typeof policyRuleKinds)[number];

export const policyRules = pgTable(
  "policy_rule",
  {
    id: typeId("id", "policy_rule")
      .primaryKey()
      .$defaultFn(() => generateId("policy_rule").toString()),
    provider: text("provider", { enum: policyProviders }).notNull(),
    submissionType: text("submission_type", {
      enum: policySubmissionTypes,
    }).notNull(),
    submissionId: text("submission_id").notNull(),
    kind: text("kind", { enum: policyRuleKinds }).notNull(),
    active: boolean("active").notNull().default(true),
    reason: text("reason"),
    correction: jsonb("correction").$type<ModOverrides>(),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("policy_rule_identity_kind_idx").on(
      table.provider,
      table.submissionType,
      table.submissionId,
      table.kind,
    ),
    index("policy_rule_identity_idx").on(
      table.provider,
      table.submissionType,
      table.submissionId,
    ),
    index("policy_rule_updated_at_idx").on(table.updatedAt),
    index("policy_rule_active_updated_at_idx").on(
      table.active,
      table.updatedAt,
    ),
  ],
);

export type PolicyRule = typeof policyRules.$inferSelect;
export type NewPolicyRule = typeof policyRules.$inferInsert;
