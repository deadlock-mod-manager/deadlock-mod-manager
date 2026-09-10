import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import {
  type NewPolicyRule,
  type PolicyProvider,
  type PolicyRule,
  type PolicyRuleKind,
  type PolicySubmissionType,
  policyRules,
} from "../schema/policy-rules";

export interface PolicyIdentity {
  provider: PolicyProvider;
  submissionType: PolicySubmissionType;
  submissionId: string;
}

export class PolicyRuleRepository {
  constructor(private readonly db: Database) {}

  async listAll(): Promise<PolicyRule[]> {
    return await this.db
      .select()
      .from(policyRules)
      .orderBy(
        asc(policyRules.provider),
        asc(policyRules.submissionType),
        asc(policyRules.submissionId),
        asc(policyRules.kind),
      );
  }

  async find(
    identity: PolicyIdentity,
    kind: PolicyRuleKind,
  ): Promise<PolicyRule | null> {
    const [rule] = await this.db
      .select()
      .from(policyRules)
      .where(
        and(
          eq(policyRules.provider, identity.provider),
          eq(policyRules.submissionType, identity.submissionType),
          eq(policyRules.submissionId, identity.submissionId),
          eq(policyRules.kind, kind),
          eq(policyRules.active, true),
        ),
      )
      .limit(1);
    return rule ?? null;
  }

  async upsert(rule: NewPolicyRule): Promise<PolicyRule> {
    const [saved] = await this.db
      .insert(policyRules)
      .values({ ...rule, active: true })
      .onConflictDoUpdate({
        target: [
          policyRules.provider,
          policyRules.submissionType,
          policyRules.submissionId,
          policyRules.kind,
        ],
        set: {
          reason: rule.reason ?? null,
          correction: rule.correction ?? null,
          createdBy: rule.createdBy ?? null,
          active: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async delete(
    identity: PolicyIdentity,
    kind: PolicyRuleKind,
  ): Promise<boolean> {
    const deleted = await this.db
      .update(policyRules)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(policyRules.provider, identity.provider),
          eq(policyRules.submissionType, identity.submissionType),
          eq(policyRules.submissionId, identity.submissionId),
          eq(policyRules.kind, kind),
          eq(policyRules.active, true),
        ),
      )
      .returning({ id: policyRules.id });
    return deleted.length > 0;
  }
}
