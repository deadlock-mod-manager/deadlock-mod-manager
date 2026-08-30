import { db, PolicyRuleRepository } from "@deadlock-mods/database";
import type { PolicyManifest } from "@deadlock-mods/shared";
import { policyRulesToManifest } from "./policy-manifest-builder";

const policyRepository = new PolicyRuleRepository(db);

export const getPolicyManifest = async (): Promise<PolicyManifest> =>
  policyRulesToManifest(await policyRepository.listAll());
