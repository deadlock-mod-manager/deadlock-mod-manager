import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import type { ModdingParticleColorEdit } from "@/types/generated/ModdingParticleColorEdit";

export function ParticleRawEditor({
  file,
  files,
  busy,
  raw,
  onRaw,
  onApply,
}: {
  file: ModdingParticleFile;
  files: ModdingParticleFile[];
  busy: boolean;
  raw: string;
  onRaw: (text: string) => void;
  onApply: (edits: ModdingParticleColorEdit[], label: string) => void;
}) {
  const { t } = useTranslation();
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [all, setAll] = useState(false);
  const pending = raw !== file.text;
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex flex-wrap gap-2 border-b p-2'>
        <Input
          className='h-8 min-w-32 flex-1 text-xs'
          aria-label={t("particleColors.find")}
          placeholder={t("particleColors.find")}
          value={find}
          onChange={(event) => setFind(event.target.value)}
        />
        <Input
          className='h-8 min-w-32 flex-1 text-xs'
          aria-label={t("particleColors.replace")}
          placeholder={t("particleColors.replace")}
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
        />
        <label className='flex items-center gap-1 text-xs'>
          <input
            type='checkbox'
            checked={regex}
            onChange={(event) => setRegex(event.target.checked)}
          />
          {t("particleColors.regex")}
        </label>
        <label className='flex items-center gap-1 text-xs'>
          <input
            type='checkbox'
            checked={all}
            onChange={(event) => setAll(event.target.checked)}
          />
          {t("particleColors.allFiles")}
        </label>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || pending || !find}
          onClick={() =>
            onApply(
              (all ? files : [file]).map((file) => ({
                path: file.path,
                text: file.text,
                changes: [],
                replace: { find, replacement, regex },
              })),
              t("particleColors.replaced", { find }),
            )
          }>
          {t("particleColors.replaceAll")}
        </Button>
      </div>
      <Textarea
        className='min-h-0 flex-1 resize-none rounded-none border-x-0 font-mono text-xs'
        aria-label={t("particleColors.raw")}
        value={raw}
        readOnly={busy}
        onChange={(event) => onRaw(event.target.value)}
      />
      <div className='flex items-center gap-2 border-t p-2'>
        <Button
          size='sm'
          disabled={busy || !pending}
          onClick={() =>
            onApply(
              [{ path: file.path, text: raw, changes: [] }],
              t("particleColors.sourceApplied"),
            )
          }>
          {t("particleColors.applySource")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || !pending}
          onClick={() => onRaw(file.text)}>
          {t("workbenchAuthoring.discard")}
        </Button>
        <p className='text-[11px] text-muted-foreground'>
          {t("particleColors.rawHint")}
        </p>
      </div>
    </div>
  );
}
