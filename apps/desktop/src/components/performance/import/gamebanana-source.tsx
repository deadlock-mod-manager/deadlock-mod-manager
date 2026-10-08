import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@deadlock-mods/ui/components/radio-group";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import {
  defaultGameBananaFile,
  type GameBananaLink,
  parseGameBananaLink,
  sortGameBananaFiles,
} from "@/lib/performance/import/gamebanana-link";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import { formatSize } from "@/lib/utils";
import type { CatalogDownloadsDto } from "@/types/generated/CatalogDownloadsDto";
import type { ImportSource } from "@/types/generated/ImportSource";

type GameBananaSourceProps = {
  isAnalyzing: boolean;
  onAnalyze: (source: ImportSource) => void;
};

export const GameBananaSource = ({
  isAnalyzing,
  onAnalyze,
}: GameBananaSourceProps) => {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState("");
  const [link, setLink] = useState<GameBananaLink | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [chosenFileId, setChosenFileId] = useState<string | null>(null);

  const files = useQuery({
    queryKey: perfQueryKeys.gameBananaFiles(link?.modId ?? 0),
    queryFn: () =>
      invoke<CatalogDownloadsDto>("get_gamebanana_submission_files", {
        remoteId: String(link?.modId),
      }),
    enabled: link !== null,
    staleTime: 5 * 60 * 1000,
    meta: { skipGlobalErrorHandler: true },
  });

  const sorted = sortGameBananaFiles(files.data?.downloads ?? []);
  const selectedFileId =
    chosenFileId ??
    defaultGameBananaFile(files.data?.downloads ?? [], link?.fileId ?? null);

  const findFiles = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseGameBananaLink(input);
    setInvalid(parsed === null);
    setLink(parsed);
    setChosenFileId(null);
  };

  const review = () => {
    if (!link || !selectedFileId) return;
    onAnalyze({
      kind: "gameBanana",
      mod_id: link.modId,
      file_id: Number(selectedFileId),
    });
  };

  return (
    <div className='flex flex-col gap-3'>
      <form className='flex flex-col gap-1.5' onSubmit={findFiles}>
        <Label htmlFor='perf-import-gamebanana-link'>
          {t("performance.import.gamebanana.label")}
        </Label>
        <div className='flex gap-2'>
          <Input
            id='perf-import-gamebanana-link'
            onChange={(event) => setInput(event.target.value)}
            placeholder={t("performance.import.gamebanana.placeholder")}
            value={input}
          />
          <Button
            disabled={input.trim().length === 0}
            type='submit'
            variant='outline'>
            {t("performance.import.gamebanana.find")}
          </Button>
        </div>
        {invalid && (
          <p className='text-destructive text-xs'>
            {t("performance.import.gamebanana.invalid")}
          </p>
        )}
      </form>

      {files.isLoading && (
        <p className='text-muted-foreground text-xs'>
          {t("performance.import.gamebanana.loading")}
        </p>
      )}
      {files.isError && (
        <p className='text-destructive text-xs'>
          {t("performance.import.gamebanana.loadFailed")}{" "}
          <span className='text-muted-foreground'>
            {getErrorMessage(files.error)}
          </span>
        </p>
      )}
      {files.isSuccess && sorted.length === 0 && (
        <p className='text-muted-foreground text-xs'>
          {t("performance.import.gamebanana.noFiles")}
        </p>
      )}

      {sorted.length > 0 && (
        <>
          <RadioGroup
            className='gap-1.5'
            onValueChange={setChosenFileId}
            value={selectedFileId ?? undefined}>
            {sorted.map((file) => (
              <Label
                className='flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5'
                key={file.fileId}>
                <RadioGroupItem
                  className='mt-0.5 shrink-0'
                  value={file.fileId}
                />
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <span className='flex items-center gap-2'>
                    <span className='truncate font-medium text-sm'>
                      {file.name}
                    </span>
                    {file.isArchived && (
                      <Badge variant='outline'>
                        {t("performance.import.gamebanana.archived")}
                      </Badge>
                    )}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {[
                      formatSize(file.size),
                      file.createdAt === null
                        ? null
                        : new Date(file.createdAt * 1000).toLocaleDateString(
                            i18n.language,
                          ),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  {file.description && (
                    <span className='line-clamp-2 text-muted-foreground text-xs'>
                      {file.description}
                    </span>
                  )}
                </span>
              </Label>
            ))}
          </RadioGroup>
          <p className='text-muted-foreground text-xs'>
            {t("performance.import.gamebanana.note")}
          </p>
          <Button
            className='self-start'
            disabled={!selectedFileId}
            isLoading={isAnalyzing}
            onClick={review}>
            {t("performance.import.gamebanana.review")}
          </Button>
        </>
      )}
    </div>
  );
};
