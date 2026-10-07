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
import { useTranslation } from "react-i18next";
import { parseKvContent } from "@/lib/kv-parser";
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
  const { t } = useTranslation("tool-kv");
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
              : t("viewer.parseFailed"),
        },
      };
    }
    return parseResult ?? { success: false };
  }, [content, isLoading, parseResult, queryError, t]);

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
            <p className='text-center text-muted-foreground'>
              {t("viewer.parsing")}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && result.error && (
        <Card className='border-destructive/50'>
          <CardHeader>
            <CardTitle className='text-destructive flex items-center gap-2'>
              <span>{t("viewer.parseError")}</span>
              <Badge variant='destructive'>{t("viewer.failed")}</Badge>
            </CardTitle>
            <CardDescription>{result.error.message}</CardDescription>
          </CardHeader>
          {(result.error.line || result.error.column) && (
            <CardContent>
              <p className='text-muted-foreground text-sm'>
                {result.error.line &&
                  t("viewer.line", { line: result.error.line })}
                {result.error.line && result.error.column && " | "}
                {result.error.column &&
                  t("viewer.column", { column: result.error.column })}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {stats && (
        <div className='flex gap-4 items-center'>
          <Badge variant='secondary'>
            {t(stats.lines === 1 ? "stats.line" : "stats.lines", {
              value: stats.lines,
            })}
          </Badge>
          <Badge variant='secondary'>
            {t(stats.chars === 1 ? "stats.character" : "stats.characters", {
              value: stats.chars,
            })}
          </Badge>
          <Badge variant='secondary'>
            {t(stats.keys === 1 ? "stats.key" : "stats.keys", {
              value: stats.keys,
            })}
          </Badge>
          {result.success && (
            <Badge className='ml-auto' variant='default'>
              {t("viewer.valid")}
            </Badge>
          )}
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div>
          <h3 className='mb-3 font-semibold text-lg'>{t("viewer.original")}</h3>
          <SyntaxHighlighter code={content} errorLine={result.error?.line} />
        </div>

        <div>
          <div className='mb-3 flex items-center justify-between'>
            <h3 className='font-semibold text-lg'>
              {showJson ? t("viewer.jsonOutput") : t("viewer.treeView")}
            </h3>
            <button
              className='text-primary text-sm underline hover:no-underline'
              onClick={() => setShowJson(!showJson)}
              type='button'>
              {showJson ? t("viewer.switchToTree") : t("viewer.switchToJson")}
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
                    {result.error ? t("viewer.fixErrors") : t("viewer.empty")}
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
