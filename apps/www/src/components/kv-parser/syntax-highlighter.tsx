import { Button } from "@deadlock-mods/ui/components/button";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  type BundledLanguage,
  type BundledTheme,
  createHighlighter,
  type HighlighterGeneric,
} from "shiki";
import { keyvaluesLanguage } from "@/lib/kv-grammar";

interface SyntaxHighlighterProps {
  code: string;
  language?: string;
  errorLine?: number;
}

export function SyntaxHighlighter({
  code,
  language = "keyvalues",
  errorLine,
}: SyntaxHighlighterProps) {
  const { theme } = useTheme();
  const [highlighter, setHighlighter] = useState<
    HighlighterGeneric<BundledLanguage, BundledTheme> | undefined
  >(undefined);
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    createHighlighter({
      themes: ["vitesse-dark", "vitesse-light"],
      langs: ["json", keyvaluesLanguage as never],
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
      lang: language,
      theme: shikiTheme,
    });

    setHtml(highlighted);
  }, [highlighter, code, language, theme]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className='relative'>
      <div className='absolute top-2 right-2 z-10'>
        <Button
          onClick={handleCopy}
          size='sm'
          variant='secondary'
          className='h-8 px-3'>
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <div
        className={`overflow-auto rounded-lg border ${
          errorLine ? "border-destructive/50" : "border-muted-foreground/20"
        }`}>
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
      {errorLine && (
        <p className='mt-2 text-destructive text-sm'>
          Error at line {errorLine}
        </p>
      )}
    </div>
  );
}
