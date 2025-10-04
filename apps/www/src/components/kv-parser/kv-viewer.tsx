import { type KeyValuesValue, parseKv } from "@deadlock-mods/kv-parser/browser";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { useMemo, useState } from "react";
import { JsonTreeView } from "./json-tree";
import { SyntaxHighlighter } from "./syntax-highlighter";

interface KvViewerProps {
  content: string;
}

interface ParseResult {
  success: boolean;
  data?: KeyValuesValue;
  error?: {
    message: string;
    line?: number;
    column?: number;
  };
}

export function KvViewer({ content }: KvViewerProps) {
  const [showJson, setShowJson] = useState(true);

  const parseResult = useMemo<ParseResult>(() => {
    if (!content.trim()) {
      return { success: false };
    }

    try {
      const parsed = parseKv(content);
      return { success: true, data: parsed };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown parsing error";

      const lineMatch = errorMessage.match(/line (\d+)/);
      const columnMatch = errorMessage.match(/column (\d+)/);

      return {
        success: false,
        error: {
          message: errorMessage,
          line: lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined,
          column: columnMatch ? Number.parseInt(columnMatch[1], 10) : undefined,
        },
      };
    }
  }, [content]);

  const stats = useMemo(() => {
    if (!parseResult.success || !parseResult.data) {
      return null;
    }

    const lines = content.split("\n").length;
    const chars = content.length;

    const countKeys = (obj: unknown): number => {
      if (typeof obj !== "object" || obj === null) return 0;
      if (Array.isArray(obj)) {
        return obj.reduce((sum, item) => sum + countKeys(item), 0);
      }
      const entries = Object.entries(obj);
      return (
        entries.length +
        entries.reduce((sum, [, val]) => sum + countKeys(val), 0)
      );
    };

    const keys = countKeys(parseResult.data);

    return { lines, chars, keys };
  }, [content, parseResult]);

  return (
    <div className='space-y-6'>
      {parseResult.error && (
        <Card className='border-destructive/50'>
          <CardHeader>
            <CardTitle className='text-destructive flex items-center gap-2'>
              <span>Parse Error</span>
              <Badge variant='destructive'>Failed</Badge>
            </CardTitle>
            <CardDescription>{parseResult.error.message}</CardDescription>
          </CardHeader>
          {(parseResult.error.line || parseResult.error.column) && (
            <CardContent>
              <p className='text-muted-foreground text-sm'>
                {parseResult.error.line && `Line: ${parseResult.error.line}`}
                {parseResult.error.line && parseResult.error.column && " | "}
                {parseResult.error.column &&
                  `Column: ${parseResult.error.column}`}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {stats && (
        <div className='flex gap-4 items-center'>
          <Badge variant='secondary'>
            {stats.lines} {stats.lines === 1 ? "line" : "lines"}
          </Badge>
          <Badge variant='secondary'>
            {stats.chars} {stats.chars === 1 ? "character" : "characters"}
          </Badge>
          <Badge variant='secondary'>
            {stats.keys} {stats.keys === 1 ? "key" : "keys"}
          </Badge>
          {parseResult.success && (
            <Badge className='ml-auto' variant='default'>
              ✓ Valid
            </Badge>
          )}
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div>
          <h3 className='mb-3 font-semibold text-lg'>Original</h3>
          <SyntaxHighlighter
            code={content}
            errorLine={parseResult.error?.line}
          />
        </div>

        <div>
          <div className='mb-3 flex items-center justify-between'>
            <h3 className='font-semibold text-lg'>
              {showJson ? "JSON Output" : "Tree View"}
            </h3>
            <button
              className='text-primary text-sm underline hover:no-underline'
              onClick={() => setShowJson(!showJson)}
              type='button'>
              Switch to {showJson ? "Tree View" : "JSON"}
            </button>
          </div>

          {parseResult.success && parseResult.data ? (
            showJson ? (
              <div className='rounded-lg border border-muted-foreground/20 overflow-auto max-h-[600px]'>
                <SyntaxHighlighter
                  code={JSON.stringify(parseResult.data, null, 2)}
                  language='json'
                />
              </div>
            ) : (
              <JsonTreeView data={parseResult.data as KeyValuesValue} />
            )
          ) : (
            <Card>
              <CardContent className='pt-6'>
                <p className='text-center text-muted-foreground'>
                  {parseResult.error
                    ? "Fix the errors above to see the parsed output"
                    : "Enter KeyValues content to see the parsed result"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
