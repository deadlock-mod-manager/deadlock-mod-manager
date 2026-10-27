import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Textarea } from "@deadlock-mods/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingResourceDocument } from "@/types/generated/ModdingResourceDocument";
import type { ModdingReference } from "@/types/generated/ModdingReference";
import type { ModdingProperty } from "@/types/generated/ModdingProperty";

const SourceCodeEditor = lazy(() =>
  import("./source-code-editor").then((module) => ({
    default: module.SourceCodeEditor,
  })),
);

interface Props {
  document: ModdingResourceDocument;
  addonId?: string;
  path: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (compile: boolean) => void;
  backup: string;
  onBackup: (id: string) => void;
  onReference?: (reference: ModdingReference) => void;
}
export const ResourceEditor = ({
  document,
  addonId,
  path,
  onDirtyChange,
  onSaved,
  backup,
  onBackup,
  onReference,
}: Props) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(document.text);
  const [properties, setProperties] = useState(document.properties);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"properties" | "source" | "references">(
    "source",
  );
  const [validatedText, setValidatedText] = useState(document.text);
  const [diagnostics, setDiagnostics] = useState(document.diagnostics);
  const [references, setReferences] = useState(document.references);
  const [field, setField] = useState<ModdingProperty | null>(null);
  const [literal, setLiteral] = useState("");
  const dirty = draft !== document.text;
  const changeDraft = (text: string) => {
    setDraft(text);
    onDirtyChange?.(text !== document.text);
  };
  const acceptParsed = (parsed: ModdingResourceDocument, text: string) => {
    setProperties(parsed.properties);
    setDiagnostics(parsed.diagnostics);
    setReferences(parsed.references);
    setValidatedText(text);
  };
  const validate = useMutation({
    mutationFn: async (target: typeof tab) => {
      const parsed = await invoke<ModdingResourceDocument>(
        "parse_modding_resource_source",
        { text: draft },
      );
      return { parsed, text: draft, target };
    },
    onSuccess: ({ parsed, text, target }) => {
      acceptParsed(parsed, text);
      if (!parsed.diagnostics.length) setTab(target);
    },
  });
  const switchTab = (target: typeof tab) => {
    if (
      target !== "source" &&
      document.editable &&
      (draft !== validatedText || diagnostics.length > 0)
    )
      validate.mutate(target);
    else setTab(target);
  };
  const applyField = useMutation({
    mutationFn: async () => {
      if (!field) return;
      const text = await invoke<string>("edit_modding_source_field", {
        text: draft,
        path: field.path,
        value: literal,
      });
      const parsed = await invoke<ModdingResourceDocument>(
        "parse_modding_resource_source",
        { text },
      );
      changeDraft(text);
      acceptParsed(parsed, text);
      setField(null);
    },
  });
  const save = useMutation({
    mutationKey: ["workbench-files-change", addonId],
    mutationFn: async (compile: boolean) => {
      const id = await invoke<string>("save_modding_resource", {
        addonId,
        path,
        fingerprint: document.fingerprint,
        text: draft,
      });
      onBackup(id);
      onDirtyChange?.(false);
      onSaved?.(compile);
      return id;
    },
  });
  const undo = useMutation({
    mutationKey: ["workbench-files-change", addonId],
    mutationFn: () =>
      invoke("undo_modding_edit", {
        addonId,
        hierarchy: "content",
        backupId: backup,
      }),
    onSuccess: () => {
      onBackup("");
      onSaved?.(false);
    },
  });
  const filtered = properties.filter((property) =>
    `${property.path} ${property.value}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 58,
    overscan: 8,
  });
  const error = save.error ?? undo.error ?? applyField.error ?? validate.error;
  const busy =
    save.isPending ||
    undo.isPending ||
    applyField.isPending ||
    validate.isPending;
  const invalid = draft === validatedText && diagnostics.length > 0;
  const altLabels = new Map([
    ["TextureAltColor1", "altColor"],
    ["g_flAltTextureAmount", "altAmount"],
    ["TextureAltTextureReveal", "altReveal"],
    ["g_flAltTextureRevealSoftness", "altSoftness"],
  ]);
  const bindings = [
    ...new Set(
      properties.flatMap(
        (property) => property.value.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) ?? [],
      ),
    ),
  ];
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex flex-wrap items-center gap-1 border-b p-2'>
        {(["properties", "source", "references"] satisfies (typeof tab)[]).map(
          (value) => (
            <Button
              key={value}
              size='sm'
              variant={tab === value ? "secondary" : "ghost"}
              disabled={busy}
              onClick={() => switchTab(value)}>
              {t(
                value === "source" && path.endsWith("_c")
                  ? "workbenchAuthoring.parsedData"
                  : `workbenchAuthoring.${value}`,
              )}
            </Button>
          ),
        )}
        {document.editable ? (
          <span className='ml-auto text-xs text-muted-foreground'>
            {t(
              dirty
                ? "workbenchAuthoring.unsaved"
                : "workbenchAuthoring.editable",
            )}
          </span>
        ) : (
          <span className='ml-auto text-xs text-muted-foreground'>
            {t("workbenchAuthoring.readOnly")}
          </span>
        )}
      </div>
      {tab !== "source" ? (
        <Input
          className='m-2 w-auto shrink-0'
          aria-label={t("workbenchAuthoring.searchProperties")}
          placeholder={t("workbenchAuthoring.searchProperties")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : (
        <div className='flex items-center justify-between gap-2 border-b px-3 py-2 text-[11px] text-muted-foreground'>
          <p>
            {t(
              document.editable
                ? "workbenchCode.shortcuts"
                : "workbenchCode.readOnly",
            )}
          </p>
          {document.editable ? (
            <Button
              size='sm'
              variant='outline'
              disabled={busy}
              onClick={() => validate.mutate("source")}>
              {t(
                validate.isPending
                  ? "workbenchCode.validating"
                  : "workbenchCode.validate",
              )}
            </Button>
          ) : null}
        </div>
      )}
      {bindings.length ? (
        <p className='px-3 pb-2 text-xs text-muted-foreground'>
          {t("workbenchAuthoring.discoveredBindings")} {bindings.join(", ")}
        </p>
      ) : null}
      {diagnostics.map((message) => (
        <p
          key={message}
          role='alert'
          className='px-3 pb-2 text-xs text-destructive'>
          {message}
        </p>
      ))}
      {tab === "source" ? (
        <Suspense
          fallback={
            <p role='status' className='p-3 text-xs'>
              {t("common.loading")}
            </p>
          }>
          <SourceCodeEditor
            value={draft}
            readOnly={!document.editable || busy}
            compiled={path.endsWith("_c")}
            onChange={changeDraft}
            onSave={() => {
              if (dirty && !busy && !invalid && document.editable)
                save.mutate(false);
            }}
          />
        </Suspense>
      ) : tab === "references" ? (
        <div className='min-h-0 flex-1 overflow-auto p-2'>
          <p className='mb-2 text-xs text-muted-foreground'>
            {t("workbenchAuthoring.referenceHint")}
          </p>
          {references
            .filter((reference) =>
              `${reference.path} ${reference.via}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((reference) => (
              <div
                key={`${reference.path}:${reference.via}`}
                className='border-b py-2 text-xs'>
                <button
                  type='button'
                  className='break-all text-left font-mono underline underline-offset-2 disabled:no-underline'
                  disabled={dirty || !!reference.diagnostic || !onReference}
                  onClick={() => onReference?.(reference)}>
                  {reference.path}
                </button>
                <p className='text-muted-foreground'>
                  {reference.origin || t("workbenchAuthoring.unsaved")} ·{" "}
                  {reference.via || t("workbenchAuthoring.directReference")}
                </p>
                {reference.diagnostic ? (
                  <p role='alert' className='text-destructive'>
                    {reference.diagnostic}
                  </p>
                ) : null}
              </div>
            ))}
        </div>
      ) : (
        <div ref={scroll} className='min-h-0 flex-1 overflow-auto'>
          <div style={{ height: rows.getTotalSize(), position: "relative" }}>
            {rows.getVirtualItems().map((row) => {
              const property = filtered[row.index];
              if (!property) return null;
              const label = altLabels.get(property.name);
              return (
                <button
                  type='button'
                  key={property.path}
                  className='absolute left-0 top-0 w-full border-b px-3 py-2 text-left text-xs hover:bg-accent'
                  style={{
                    height: row.size,
                    transform: `translateY(${row.start}px)`,
                  }}
                  title={`${property.path}\n${property.value}`}
                  disabled={!document.editable || busy}
                  onClick={() => {
                    setField(property);
                    setLiteral(property.value);
                  }}>
                  <span className='block truncate font-medium'>
                    {label ? t(`workbenchAuthoring.${label}`) : property.path}
                  </span>
                  <span className='block truncate font-mono text-muted-foreground'>
                    {property.value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {field ? (
        <div className='space-y-2 border-t p-2'>
          <p className='break-all font-mono text-xs'>{field.path}</p>
          <Textarea
            aria-label={t("workbenchAuthoring.propertyValue")}
            value={literal}
            onChange={(event) => setLiteral(event.target.value)}
            className='font-mono text-xs'
          />
          <p className='text-xs text-muted-foreground'>
            {t("workbenchAuthoring.literalHint")}
          </p>
          <Button size='sm' disabled={busy} onClick={() => applyField.mutate()}>
            {t("workbenchAuthoring.applyField")}
          </Button>
          <Button size='sm' variant='ghost' onClick={() => setField(null)}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}
      {document.editable ? (
        <div className='flex flex-wrap gap-2 border-t p-2'>
          <Button
            size='sm'
            disabled={!dirty || busy || invalid}
            onClick={() => save.mutate(false)}>
            {t("workbenchAuthoring.save")}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={!dirty || busy || invalid}
            onClick={() => save.mutate(true)}>
            {t("workbenchAuthoring.saveCompile")}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            disabled={!dirty || busy}
            onClick={() => {
              changeDraft(document.text);
              acceptParsed(document, document.text);
              setField(null);
            }}>
            {t("workbenchAuthoring.discard")}
          </Button>
          {backup ? (
            <Button
              size='sm'
              variant='outline'
              disabled={busy || dirty}
              onClick={() => undo.mutate()}>
              {t("workbenchAuthoring.undo")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role='alert' className='p-2 text-xs text-destructive'>
          {error.message}
        </p>
      ) : null}
      <p className='border-t p-2 text-[11px] text-muted-foreground'>
        {t("workbenchAuthoring.runtimeLimit")}
      </p>
    </div>
  );
};
