import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  type BundledLanguage,
  type BundledTheme,
  createHighlighter,
  type HighlighterGeneric,
} from "shiki";

const keyvaluesLanguage = {
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

export const SyntaxHighlighter = ({ code }: { code: string }) => {
  const { theme } = useTheme();
  const [highlighter, setHighlighter] = useState<
    HighlighterGeneric<BundledLanguage, BundledTheme> | undefined
  >(undefined);
  const [html, setHtml] = useState("");

  useEffect(() => {
    createHighlighter({
      themes: ["vitesse-dark", "vitesse-light"],
      langs: [keyvaluesLanguage as never],
    }).then(setHighlighter);
  }, []);

  useEffect(() => {
    if (!highlighter || !code) {
      setHtml("");
      return;
    }

    const shikiTheme =
      theme === "dark" || theme === "system" ? "vitesse-dark" : "vitesse-light";

    const highlighted = highlighter.codeToHtml(code, {
      lang: "keyvalues",
      theme: shikiTheme,
    });

    setHtml(highlighted);
  }, [highlighter, code, theme]);

  return (
    <div className='overflow-auto rounded-md border'>
      {html ? (
        <div
          className='[&_pre]:m-0 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed [&_code]:font-mono'
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki generates safe HTML for syntax highlighting
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className='m-0 p-4 text-sm'>
          <code className='font-mono'>{code}</code>
        </pre>
      )}
    </div>
  );
};

