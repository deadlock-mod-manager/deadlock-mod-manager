export const keyvaluesLanguage = {
  name: "keyvalues",
  scopeName: "source.keyvalues",
  patterns: [
    { include: "#comments" },
    { include: "#directives" },
    { include: "#conditionals" },
    { include: "#braces" },
    { include: "#strings" },
    { include: "#numbers" },
  ],
  repository: {
    comments: {
      patterns: [
        {
          name: "comment.line.double-slash.keyvalues",
          match: "//.*$",
        },
      ],
    },
    directives: {
      patterns: [
        {
          name: "keyword.control.directive.keyvalues",
          match: "^\\s*(#include|#base)\\s+",
        },
      ],
    },
    conditionals: {
      patterns: [
        {
          name: "keyword.control.conditional.keyvalues",
          match: "\\[(\\$[A-Za-z0-9_]+|\\![A-Za-z0-9_]+)\\]",
          captures: {
            1: { name: "variable.other.conditional.keyvalues" },
          },
        },
      ],
    },
    braces: {
      patterns: [
        {
          name: "punctuation.section.braces.begin.keyvalues",
          match: "\\{",
        },
        {
          name: "punctuation.section.braces.end.keyvalues",
          match: "\\}",
        },
      ],
    },
    strings: {
      patterns: [
        {
          name: "string.quoted.double.keyvalues",
          begin: '"',
          end: '"',
          patterns: [
            {
              name: "constant.character.escape.keyvalues",
              match: "\\\\(n|t|r|\\\\|\"|')",
            },
          ],
        },
        {
          name: "string.unquoted.keyvalues",
          match: "\\b[A-Za-z0-9_\\.\\-/]+\\b",
        },
      ],
    },
    numbers: {
      patterns: [
        {
          name: "constant.numeric.float.keyvalues",
          match: "\\b-?\\d+\\.\\d+\\b",
        },
        {
          name: "constant.numeric.integer.keyvalues",
          match: "\\b-?\\d+\\b",
        },
      ],
    },
  },
} as const;
