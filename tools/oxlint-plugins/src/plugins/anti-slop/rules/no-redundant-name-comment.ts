import { defineRule, type ESTree } from "@oxlint/plugins";

function nameWords(name: string): string {
  return name
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_+/g, " ")
    .trim()
    .toLowerCase();
}

export const noRedundantNameCommentRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Reject standalone line comments that repeat the next declaration or call name.",
    },
    messages: {
      repeatedName:
        "This comment repeats `{{name}}`. Remove it or explain why the code needs it.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    function check(node: ESTree.Node, name: string) {
      const comments = sourceCode.getCommentsBefore(node);
      const comment = comments.at(-1);
      if (comment?.type !== "Line") return;

      const { line, column } = comment.loc.start;
      if (
        line + 1 !== node.loc.start.line ||
        comments.at(-2)?.loc.end.line === line - 1 ||
        sourceCode.lines[line - 1]?.slice(0, column).trim()
      ) {
        return;
      }

      const words = nameWords(name);
      if (
        words.includes(" ") &&
        comment.value.trim().replace(/\.$/, "").toLowerCase() === words
      ) {
        context.report({
          loc: comment.loc,
          messageId: "repeatedName",
          data: { name },
        });
      }
    }
    return {
      FunctionDeclaration(node) {
        if (node.id) check(declarationStart(node), node.id.name);
      },
      VariableDeclaration(node) {
        const [declarator] = node.declarations;
        if (
          node.declarations.length === 1 &&
          declarator?.id.type === "Identifier"
        ) {
          check(declarationStart(node), declarator.id.name);
        }
      },
      ExpressionStatement(node) {
        if (node.expression.type !== "CallExpression") return;
        const { callee } = node.expression;
        if (callee.type === "Identifier") check(node, callee.name);
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ) {
          check(node, callee.property.name);
        }
      },
    };
  },
});

function declarationStart(node: ESTree.Node) {
  const { parent } = node;
  return parent?.type === "ExportNamedDeclaration" ||
    parent?.type === "ExportDefaultDeclaration"
    ? parent
    : node;
}
