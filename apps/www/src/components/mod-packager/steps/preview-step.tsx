import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ModConfigSchema } from "@deadlock-mods/dmodpkg";
import {
  ArrowLeft,
  Check,
  Copy,
  FileArchive,
  FileJson,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import type { WizardStepProps } from "../types";

interface PreviewStepProps extends WizardStepProps {
  hasZip: boolean;
  onDownloadZip: (metadata: Record<string, unknown>) => Promise<void>;
  onReset: () => void;
}

function buildOutput(
  formData: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    $schema: "https://deadlockmods.app/v1/mod-config.json",
    schema_version: 1,
  };

  const fieldOrder = [
    "name",
    "display_name",
    "version",
    "description",
    "game_version",
    "authors",
    "license",
    "readme",
    "homepage",
    "repository",
    "screenshots",
    "layers",
    "variant_groups",
    "metadata",
    "dependencies",
    "conflicts",
    "breaks_on_update",
    "load_priority",
  ];

  for (const key of fieldOrder) {
    const value = formData[key];
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    output[key] = value;
  }

  return output;
}

export function PreviewStep({
  form,
  onBack,
  hasZip,
  onDownloadZip,
  onReset,
}: PreviewStepProps) {
  const formData = form.getValues();
  const output = useMemo(() => buildOutput(formData), [formData]);
  const jsonString = useMemo(() => JSON.stringify(output, null, 2), [output]);

  const [highlightedHtml, setHighlightedHtml] = useState("");

  useEffect(() => {
    codeToHtml(jsonString, {
      lang: "json",
      theme: "github-dark",
    }).then(setHighlightedHtml);
  }, [jsonString]);

  const validationResult = useMemo(() => {
    const result = ModConfigSchema.safeParse(output);
    if (result.success) return { valid: true, errors: [] };
    return {
      valid: false,
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }, [output]);

  const downloadJson = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dmm.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(jsonString);
    toast.success("Copied to clipboard");
  };

  return (
    <div className='space-y-6'>
      {/* Validation status */}
      {validationResult.valid ? (
        <div className='flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3'>
          <Check className='h-4 w-4 text-green-500' />
          <span className='font-medium text-green-500 text-sm'>
            Configuration is valid
          </span>
        </div>
      ) : (
        <div className='rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2'>
          <div className='flex items-center gap-2'>
            <TriangleAlert className='h-4 w-4 text-yellow-500' />
            <span className='font-medium text-sm text-yellow-500'>
              Validation warnings
            </span>
          </div>
          <ul className='space-y-1 pl-6'>
            {validationResult.errors.map((error) => (
              <li
                key={`${error.path}-${error.message}`}
                className='text-muted-foreground text-xs list-disc'>
                <code className='text-yellow-400'>{error.path}</code>:{" "}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* JSON Preview */}
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <span className='font-medium text-sm'>dmm.json preview</span>
          <Button variant='ghost' size='sm' onClick={copyJson}>
            <Copy className='mr-1.5 h-3.5 w-3.5' />
            Copy
          </Button>
        </div>
        <div
          className='overflow-auto rounded-lg border bg-[#0d1117] p-4 text-sm [&_pre]:!bg-transparent [&_pre]:!p-0'
          style={{ maxHeight: "400px" }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </div>

      {/* Download actions */}
      <div className='flex flex-col gap-3 sm:flex-row'>
        <Button onClick={downloadJson} className='flex-1'>
          <FileJson className='mr-2 h-4 w-4' />
          Download dmm.json
        </Button>
        {hasZip && (
          <Button
            variant='secondary'
            onClick={() => onDownloadZip(output)}
            className='flex-1'>
            <FileArchive className='mr-2 h-4 w-4' />
            Download Zip with Metadata
          </Button>
        )}
      </div>

      <div className='flex justify-between pt-2 border-t'>
        <Button variant='outline' onClick={onBack}>
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back
        </Button>
        <Button variant='ghost' onClick={onReset}>
          <RefreshCcw className='mr-2 h-4 w-4' />
          Start Over
        </Button>
      </div>
    </div>
  );
}
