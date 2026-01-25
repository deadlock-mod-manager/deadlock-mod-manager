import type { KeyValuesValue } from "@deadlock-mods/kv-parser";
import { Badge } from "@deadlock-mods/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { parseKvContent } from "@/lib/kv-parser.server";
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

  const {
    data: parseResult,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["kv-parse", content],
    queryFn: () => parseKvContent({ content }),
    enabled: content.trim().length > 0,
  });

  const result: ParseResult = useMemo(() => {
    if (!content.trim()) {
      return { success: false };
    }
    if (isLoading) {
      return { success: false };
    }
    if (queryError) {
      return {
        success: false,
        error: {
          message:
            queryError instanceof Error
              ? queryError.message
              : "Failed to parse KeyValues content",
        },
      };
    }
    return parseResult ?? { success: false };
  }, [content, isLoading, parseResult, queryError]);

  const stats = useMemo(() => {
    if (!result.success || !result.data) {
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

    const keys = countKeys(result.data);

    return { lines, chars, keys };
  }, [content, result]);

  return (
    <div className='space-y-6'>
      {isLoading && (
        <Card>
          <CardContent className='pt-6'>
            <p className='text-center text-muted-foreground'>Parsing...</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && result.error && (
        <Card className='border-destructive/50'>
          <CardHeader>
            <CardTitle className='text-destructive flex items-center gap-2'>
              <span>Parse Error</span>
              <Badge variant='destructive'>Failed</Badge>
            </CardTitle>
            <CardDescription>{result.error.message}</CardDescription>
          </CardHeader>
          {(result.error.line || result.error.column) && (
            <CardContent>
              <p className='text-muted-foreground text-sm'>
                {result.error.line && `Line: ${result.error.line}`}
                {result.error.line && result.error.column && " | "}
                {result.error.column && `Column: ${result.error.column}`}
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
          {result.success && (
            <Badge className='ml-auto' variant='default'>
              ✓ Valid
            </Badge>
          )}
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div>
          <h3 className='mb-3 font-semibold text-lg'>Original</h3>
          <SyntaxHighlighter code={content} errorLine={result.error?.line} />
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

          {!isLoading && result.success && result.data ? (
            showJson ? (
              <div className='rounded-lg border border-muted-foreground/20 overflow-auto max-h-[600px]'>
                <SyntaxHighlighter
                  code={JSON.stringify(result.data, null, 2)}
                  language='json'
                />
              </div>
            ) : (
              <JsonTreeView data={result.data as KeyValuesValue} />
            )
          ) : (
            !isLoading && (
              <Card>
                <CardContent className='pt-6'>
                  <p className='text-center text-muted-foreground'>
                    {result.error
                      ? "Fix the errors above to see the parsed output"
                      : "Enter KeyValues content to see the parsed result"}
                  </p>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}
