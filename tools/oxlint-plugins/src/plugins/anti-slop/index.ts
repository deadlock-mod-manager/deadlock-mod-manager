import { definePlugin } from "@oxlint/plugins";

import { noBackdropFilterRule } from "./rules/no-backdrop-filter.ts";
import { noChainedTypeAssertionsRule } from "./rules/no-chained-type-assertions.ts";
import { noCommentedOutCodeRule } from "./rules/no-commented-out-code.ts";
import { noConditionalEmptyObjectSpreadRule } from "./rules/no-conditional-empty-object-spread.ts";
import { noKnownValueWideningRule } from "./rules/no-known-value-widening.ts";
import { noObjectParametersRule } from "./rules/no-object-parameters.ts";
import { noRestatingCommentRule } from "./rules/no-restating-comment.ts";
import { noReflectApplyRule } from "./rules/no-reflect-apply.ts";
import { noReflectGetRule } from "./rules/no-reflect-get.ts";
import { noRuntimeTypeofRule } from "./rules/no-runtime-typeof.ts";
import { noStepCommentRule } from "./rules/no-step-comment.ts";
import { noForbiddenTermInSymbolNamesRule } from "./rules/no-shape-in-symbol-names.ts";
import { noUnknownParametersRule } from "./rules/no-unknown-parameters.ts";
import { noUnknownReturnsRule } from "./rules/no-unknown-returns.ts";
import { noUnknownTypeAliasesRule } from "./rules/no-unknown-type-aliases.ts";
import { noUntrackedTodoRule } from "./rules/no-untracked-todo.ts";
import { noUnsafeDictionaryTypeRule } from "./rules/no-unsafe-dictionary-type.ts";
import { noWidenThenAssertRule } from "./rules/no-widen-then-assert.ts";

/** Generic Oxlint rules that reject low-evidence and low-signal implementation patterns. */
const antiSlopPlugin = definePlugin({
  meta: { name: "anti-slop" },
  rules: {
    "no-backdrop-filter": noBackdropFilterRule,
    "no-chained-type-assertions": noChainedTypeAssertionsRule,
    "no-commented-out-code": noCommentedOutCodeRule,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
    "no-known-value-widening": noKnownValueWideningRule,
    "no-object-parameters": noObjectParametersRule,
    "no-restating-comment": noRestatingCommentRule,
    "no-reflect-apply": noReflectApplyRule,
    "no-reflect-get": noReflectGetRule,
    "no-runtime-typeof": noRuntimeTypeofRule,
    "no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule,
    "no-shape-in-symbol-names": noForbiddenTermInSymbolNamesRule,
    "no-step-comment": noStepCommentRule,
    "no-unknown-parameters": noUnknownParametersRule,
    "no-unknown-returns": noUnknownReturnsRule,
    "no-unknown-type-aliases": noUnknownTypeAliasesRule,
    "no-untracked-todo": noUntrackedTodoRule,
    "no-widen-then-assert": noWidenThenAssertRule,
  },
});

export default antiSlopPlugin;
