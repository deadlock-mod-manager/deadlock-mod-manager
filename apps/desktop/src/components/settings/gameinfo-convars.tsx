import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { PlusIcon, TrashIcon } from "@deadlock-mods/ui/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/lib/errors";
import {
  blankConvar,
  ConvarTokenError,
  clearedExistingConvar,
  displayName,
  hasDuplicateConvarName,
  parseConvarDocument,
  serializeConvarDocument,
  splitDisplayName,
  unsafeConvarToken,
  type ConvarDocument,
  type ConvarRow,
} from "@/lib/gameinfo-convars";
import { invokeGuarded } from "@/lib/game-guard";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";

export const GameInfoConvars = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<ConvarRow[]>([]);
  const [document, setDocument] = useState<ConvarDocument>({
    rows: [],
    segments: [],
    opaque: false,
  });
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["gameinfo-convars"],
    queryFn: () => invoke<string>("get_gameinfo_convars"),
    staleTime: STALE_TIME_LOCAL,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (data != null && !dirty) {
      const parsed = parseConvarDocument(data);
      setDocument(parsed);
      setRows(parsed.rows);
    }
  }, [data, dirty]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const name = (nameDrafts[row.id] ?? displayName(row)).toLowerCase();
      return name.includes(needle) || row.value.toLowerCase().includes(needle);
    });
  }, [nameDrafts, query, rows]);

  const save = useMutation({
    mutationFn: (content: string) =>
      invokeGuarded<string>("update_gameinfo_convars", { content }),
    onSuccess: async (saved) => {
      const parsed = parseConvarDocument(saved);
      setDocument(parsed);
      setRows(parsed.rows);
      setNameDrafts({});
      setDirty(false);
      toast.success(t("settings.gameinfoConvarsSaved"));
      await queryClient.invalidateQueries({ queryKey: ["gameinfo-convars"] });
      await queryClient.invalidateQueries({ queryKey: ["gameinfo-status"] });
    },
    onError: (saveError) => {
      toast.error(t("settings.gameinfoConvarsSaveError"), {
        description: getErrorMessage(saveError),
      });
    },
  });

  const busy = save.isPending;

  const closeAdd = () => {
    setAddOpen(false);
    setAddName("");
    setAddValue("");
    setAddError("");
  };

  const confirmAdd = () => {
    const parsed = splitDisplayName(addName);
    if (!parsed.name) {
      setAddError(t("settings.gameinfoConvarsNameRequired"));
      return;
    }
    if (
      unsafeConvarToken(parsed.name) ||
      unsafeConvarToken(parsed.parent ?? "") ||
      unsafeConvarToken(addValue)
    ) {
      setAddError(t("settings.gameinfoConvarsBadToken"));
      return;
    }
    const nextName = (
      parsed.parent ? `${parsed.parent}.${parsed.name}` : parsed.name
    ).toLowerCase();
    const taken = rows.some(
      (row) =>
        (nameDrafts[row.id] ?? displayName(row)).toLowerCase() === nextName,
    );
    if (taken) {
      setAddError(t("settings.gameinfoConvarsDuplicate"));
      return;
    }
    const created = { ...blankConvar(), ...parsed, value: addValue };
    setRows((current) => [created, ...current]);
    setDirty(true);
    setQuery("");
    closeAdd();
    toast.success(t("settings.gameinfoConvarsAdded"));
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = 0;
    });
  };

  const removeRow = (id: string, name: string) => {
    const top = listRef.current?.scrollTop ?? 0;
    setDirty(true);
    setRows((current) => current.filter((row) => row.id !== id));
    setNameDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    toast.success(t("settings.gameinfoConvarsRemoved", { name }));
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = top;
    });
  };

  if (isLoading) {
    return (
      <p className='text-muted-foreground text-sm'>{t("common.loading")}</p>
    );
  }
  if (isError) {
    return (
      <p className='text-destructive text-sm'>
        {t("settings.gameinfoConvarsLoadError")} {getErrorMessage(error)}
      </p>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h4 className='font-bold text-sm'>{t("settings.gameinfoConvars")}</h4>
          <p className='text-muted-foreground text-sm'>
            {t("settings.gameinfoConvarsDescription")}
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={() => setAddOpen(true)}
          type='button'
          variant='outline'>
          <PlusIcon className='h-4 w-4' />
          {t("settings.gameinfoConvarsAdd")}
        </Button>
      </div>
      <Input
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("settings.gameinfoConvarsSearch")}
        value={query}
      />
      <div className='max-h-80 space-y-2 overflow-y-auto pr-4' ref={listRef}>
        {visibleRows.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t("settings.gameinfoConvarsEmpty")}
          </p>
        ) : (
          visibleRows.map((row) => (
            <div className='flex items-center gap-2' key={row.id}>
              <Input
                className='font-mono text-sm'
                disabled={busy}
                onBlur={() => {
                  const draft = nameDrafts[row.id];
                  if (draft == null) return;
                  const names = rows.map((item) =>
                    item.id === row.id
                      ? draft
                      : (nameDrafts[item.id] ?? displayName(item)),
                  );
                  if (!draft.trim()) {
                    toast.error(t("settings.gameinfoConvarsKeepName"));
                    setNameDrafts((current) => {
                      const next = { ...current };
                      delete next[row.id];
                      return next;
                    });
                    return;
                  }
                  if (hasDuplicateConvarName(names)) {
                    toast.error(t("settings.gameinfoConvarsDuplicate"));
                    setNameDrafts((current) => {
                      const next = { ...current };
                      delete next[row.id];
                      return next;
                    });
                    return;
                  }
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id
                        ? { ...item, ...splitDisplayName(draft) }
                        : item,
                    ),
                  );
                  setDirty(true);
                  setNameDrafts((current) => {
                    const next = { ...current };
                    delete next[row.id];
                    return next;
                  });
                }}
                onChange={(event) =>
                  setNameDrafts((current) => ({
                    ...current,
                    [row.id]: event.target.value,
                  }))
                }
                placeholder={t("settings.gameinfoConvarsName")}
                spellCheck={false}
                value={nameDrafts[row.id] ?? displayName(row)}
              />
              <Input
                className='font-mono text-sm'
                disabled={busy}
                onChange={(event) => {
                  setDirty(true);
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  );
                }}
                placeholder={t("settings.gameinfoConvarsValue")}
                spellCheck={false}
                value={row.value}
              />
              <Button
                aria-label={t("common.remove")}
                disabled={busy}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => removeRow(row.id, displayName(row) || row.name)}
                size='icon'
                type='button'
                variant='ghost'>
                <TrashIcon className='h-4 w-4' />
              </Button>
            </div>
          ))
        )}
      </div>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          {document.opaque ? t("settings.gameinfoConvarsOpaque") : null}
          {document.opaque && dirty ? " " : null}
          {dirty ? t("settings.gameinfoConvarsUnsaved") : null}
        </p>
        <div className='flex gap-2'>
          <Button
            disabled={!dirty || save.isPending}
            onClick={async () => {
              const { data: latest } = await refetch();
              if (latest == null) return;
              const parsed = parseConvarDocument(latest);
              setDocument(parsed);
              setRows(parsed.rows);
              setNameDrafts({});
              setDirty(false);
              toast.success(t("settings.gameinfoConvarsDiscarded"));
            }}
            type='button'
            variant='outline'>
            {t("settings.gameinfoConvarsDiscard")}
          </Button>
          <Button
            disabled={!dirty}
            isLoading={save.isPending}
            onClick={() => {
              const flushed = rows.map((row) => {
                const draft = nameDrafts[row.id];
                return draft == null
                  ? row
                  : { ...row, ...splitDisplayName(draft) };
              });
              if (clearedExistingConvar(flushed)) {
                toast.error(t("settings.gameinfoConvarsKeepName"));
                return;
              }
              if (hasDuplicateConvarName(flushed.map(displayName))) {
                toast.error(t("settings.gameinfoConvarsDuplicate"));
                return;
              }
              try {
                save.mutate(serializeConvarDocument(document, flushed));
              } catch (error) {
                if (error instanceof ConvarTokenError) {
                  toast.error(t("settings.gameinfoConvarsBadToken"));
                  return;
                }
                throw error;
              }
            }}
            type='button'>
            {t("common.save")}
          </Button>
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => (open ? setAddOpen(true) : closeAdd())}
        open={addOpen}>
        <DialogContent className='sm:max-w-[425px]'>
          <DialogHeader>
            <DialogTitle>{t("settings.gameinfoConvarsAddTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.gameinfoConvarsAddBody")}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='space-y-1'>
              <Label htmlFor='convar-name'>
                {t("settings.gameinfoConvarsName")}
              </Label>
              <Input
                id='convar-name'
                onChange={(event) => {
                  setAddName(event.target.value);
                  setAddError("");
                }}
                placeholder='fps_max'
                spellCheck={false}
                value={addName}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='convar-value'>
                {t("settings.gameinfoConvarsValue")}
              </Label>
              <Input
                id='convar-value'
                onChange={(event) => setAddValue(event.target.value)}
                placeholder='0'
                spellCheck={false}
                value={addValue}
              />
            </div>
            {addError ? (
              <p className='text-destructive text-sm'>{addError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={closeAdd} type='button' variant='outline'>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmAdd} type='button'>
              {t("settings.gameinfoConvarsAdd")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
