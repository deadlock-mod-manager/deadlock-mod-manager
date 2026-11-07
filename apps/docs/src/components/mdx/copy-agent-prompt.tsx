"use client";

import { useCopyButton } from "fumadocs-ui/utils/use-copy-button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";

export function CopyAgentPrompt({ prompt }: { prompt: string }) {
  const [copyFailed, setCopyFailed] = useState(false);
  const [checked, onCopy] = useCopyButton(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  });
  const copied = checked && !copyFailed;

  return (
    <div className='not-prose my-6 rounded-lg border border-fd-border bg-fd-card p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <p className='font-medium text-fd-foreground'>Build with an agent</p>
          <p className='mt-1 text-sm text-fd-muted-foreground'>
            Copy a prompt with the protocol requirements and verification steps.
          </p>
        </div>
        <button
          type='button'
          className={buttonVariants({ color: "secondary", className: "gap-2" })}
          onClick={onCopy}>
          {copied ? (
            <Check aria-hidden='true' className='size-4' />
          ) : (
            <Copy aria-hidden='true' className='size-4' />
          )}
          <span aria-live='polite'>
            {copied ? "Copied" : "Copy agent prompt"}
          </span>
        </button>
      </div>
      {copyFailed && (
        <p role='alert' className='mt-3 text-sm text-fd-muted-foreground'>
          Clipboard access failed. Select and copy the prompt below.
        </p>
      )}
      <details className='mt-3' open={copyFailed}>
        <summary className='cursor-pointer text-sm text-fd-muted-foreground'>
          Read the prompt
        </summary>
        <pre className='mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-fd-muted p-4 text-xs text-fd-foreground'>
          <code>{prompt}</code>
        </pre>
      </details>
    </div>
  );
}
