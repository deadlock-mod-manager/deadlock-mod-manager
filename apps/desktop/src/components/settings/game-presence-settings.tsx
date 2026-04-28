import type {
  PresenceTextTemplatePair,
  PresenceTextTemplates,
} from "@deadlock-mods/deadlock-discord-presence";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Copy, RotateCcw, Save } from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { createDefaultGamePresenceTextTemplates } from "@/lib/store/slices/settings";
import { Trash } from "@phosphor-icons/react";

type TemplateKey = Extract<keyof PresenceTextTemplates, string>;
type TemplateField = keyof PresenceTextTemplatePair;

interface TemplateRow {
  key: TemplateKey;
  phaseKey: string;
  descriptionKey: string;
  defaultDetails: string;
  defaultState: string;
}

interface GamePresenceHero {
  codename: string;
  name: string;
  hideoutText: string;
}

interface SamplePresenceValues {
  hero: string;
  heroPresence: string;
  mode: string;
  partySize: string;
  partyMax: string;
}

const GLOBAL_SCOPE_VALUE = "__global_presence_templates__";

const PREVIEW_LARGE_IMAGE_URL =
  "https://cdn.discordapp.com/app-assets/1498796149581152358/1498796905994387727.png";

const TEMPLATE_ROWS: TemplateRow[] = [
  {
    key: "mainMenu",
    phaseKey: "gamePresence.phases.mainMenu",
    descriptionKey: "gamePresence.phaseDescriptions.mainMenu",
    defaultDetails: "Main Menu",
    defaultState: "",
  },
  {
    key: "soloHideout",
    phaseKey: "gamePresence.phases.soloHideout",
    descriptionKey: "gamePresence.phaseDescriptions.soloHideout",
    defaultDetails: "{heroPresence}",
    defaultState: "Playing Solo (1 of {partyMax})",
  },
  {
    key: "partyHideout",
    phaseKey: "gamePresence.phases.partyHideout",
    descriptionKey: "gamePresence.phaseDescriptions.partyHideout",
    defaultDetails: "{heroPresence}",
    defaultState: "Party of {partySize}",
  },
  {
    key: "inQueue",
    phaseKey: "gamePresence.phases.inQueue",
    descriptionKey: "gamePresence.phaseDescriptions.inQueue",
    defaultDetails: "Looking for Match...",
    defaultState: "In Queue {partySize}",
  },
  {
    key: "soloMatch",
    phaseKey: "gamePresence.phases.soloMatch",
    descriptionKey: "gamePresence.phaseDescriptions.soloMatch",
    defaultDetails: "{mode}",
    defaultState: "Playing as {hero}",
  },
  {
    key: "partyMatch",
    phaseKey: "gamePresence.phases.partyMatch",
    descriptionKey: "gamePresence.phaseDescriptions.partyMatch",
    defaultDetails: "{mode} · {hero}",
    defaultState: "Party of {partySize}",
  },
  {
    key: "postMatch",
    phaseKey: "gamePresence.phases.postMatch",
    descriptionKey: "gamePresence.phaseDescriptions.postMatch",
    defaultDetails: "Post-Match",
    defaultState: "",
  },
  {
    key: "spectating",
    phaseKey: "gamePresence.phases.spectating",
    descriptionKey: "gamePresence.phaseDescriptions.spectating",
    defaultDetails: "Spectating a Match",
    defaultState: "",
  },
];

interface PlaceholderMeta {
  token: string;
  tooltipKey: string;
}

const PLACEHOLDERS: PlaceholderMeta[] = [
  { token: "{hero}", tooltipKey: "hero" },
  { token: "{heroPresence}", tooltipKey: "heroPresence" },
  { token: "{mode}", tooltipKey: "mode" },
  { token: "{partySize}", tooltipKey: "partySize" },
  { token: "{partyMax}", tooltipKey: "partyMax" },
];

const DEFAULT_SAMPLE_VALUES: SamplePresenceValues = {
  hero: "Vindicta",
  heroPresence: "Sleep Walking in the Hideout",
  mode: "Playing Standard (6v6)",
  partySize: "3",
  partyMax: "6",
};

function coerceTemplateKey(value: string): TemplateKey {
  return TEMPLATE_ROWS.find((row) => row.key === value)?.key ?? "soloHideout";
}

interface PlaceholderButtonsProps {
  field: TemplateField;
  onInsert: (field: TemplateField, placeholder: string) => void;
  t: (key: string) => string;
}

const PlaceholderButtons = ({
  field,
  onInsert,
  t,
}: PlaceholderButtonsProps) => (
  <TooltipProvider delayDuration={300}>
    <div className='flex flex-wrap gap-1.5'>
      {PLACEHOLDERS.map(({ token, tooltipKey }) => (
        <Tooltip key={`${field}-${token}`}>
          <TooltipTrigger asChild>
            <Button
              className='h-7 gap-1 rounded-full px-2 font-mono text-[11px]'
              onClick={() => onInsert(field, token)}
              size='sm'
              type='button'
              variant='outline'>
              <Copy className='size-3' />
              {token}
            </Button>
          </TooltipTrigger>
          <TooltipContent className='max-w-[220px] space-y-1 text-center'>
            <p>
              {t(`gamePresence.placeholderTooltips.${tooltipKey}.description`)}
            </p>
            <p className='font-mono text-white/60'>
              {t(`gamePresence.placeholderTooltips.${tooltipKey}.example`)}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  </TooltipProvider>
);

interface TemplateFieldEditorProps {
  field: TemplateField;
  selectedHeroCodename: string | null;
  selectedRow: TemplateRow;
  selectedTemplate: PresenceTextTemplatePair;
  selectedGlobalTemplate: PresenceTextTemplatePair;
  onUpdate: (key: TemplateKey, field: TemplateField, value: string) => void;
  onInsertPlaceholder: (field: TemplateField, placeholder: string) => void;
  t: (key: string, options?: Record<string, string>) => string;
}

const TemplateFieldEditor = ({
  field,
  selectedHeroCodename,
  selectedRow,
  selectedTemplate,
  selectedGlobalTemplate,
  onUpdate,
  onInsertPlaceholder,
  t,
}: TemplateFieldEditorProps) => {
  const fallback = formatFallbackText(
    fieldFallback(selectedGlobalTemplate, selectedRow, field),
    t("gamePresence.emptyLine"),
  );

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-3'>
        <Label
          className='font-medium text-sm'
          htmlFor={`${selectedHeroCodename ?? "global"}-${selectedRow.key}-${field}`}>
          {field === "details"
            ? t("gamePresence.detailsTemplate")
            : t("gamePresence.stateTemplate")}
        </Label>
        <p className='text-muted-foreground text-xs'>
          {selectedHeroCodename === null
            ? t("gamePresence.defaultValue", { value: fallback })
            : t("gamePresence.fallbackValue", { value: fallback })}
        </p>
      </div>
      <Input
        className='h-10 bg-background/70'
        id={`${selectedHeroCodename ?? "global"}-${selectedRow.key}-${field}`}
        name={`${selectedRow.key}-${field}`}
        onChange={(event) =>
          onUpdate(selectedRow.key, field, event.target.value)
        }
        placeholder={
          selectedHeroCodename === null
            ? fieldFallback(selectedGlobalTemplate, selectedRow, field)
            : t("gamePresence.heroOverrides.inheritPlaceholder")
        }
        value={selectedTemplate[field]}
      />
      <div className='space-y-1.5'>
        <p className='text-muted-foreground text-xs'>
          {field === "details"
            ? t("gamePresence.insertIntoDetails")
            : t("gamePresence.insertIntoState")}
        </p>
        <PlaceholderButtons
          field={field}
          onInsert={onInsertPlaceholder}
          t={t}
        />
      </div>
    </div>
  );
};

function renderPreviewText(
  template: string,
  fallback: string,
  sampleValues: SamplePresenceValues,
): string {
  const source = template.trim() === "" ? fallback : template;
  const rendered = source
    .replace("{heroPresence}", sampleValues.heroPresence)
    .replace("{hero}", sampleValues.hero)
    .replace("{mode}", sampleValues.mode)
    .replace("{partySize}", sampleValues.partySize)
    .replace("{partyMax}", sampleValues.partyMax)
    .trim();

  return rendered.slice(0, 128);
}

function fieldFallback(
  template: PresenceTextTemplatePair,
  row: TemplateRow,
  field: TemplateField,
): string {
  const globalValue = template[field].trim();
  if (globalValue !== "") {
    return globalValue;
  }

  return field === "details" ? row.defaultDetails : row.defaultState;
}

function formatFallbackText(value: string, emptyText: string): string {
  return value.trim() === "" ? emptyText : value;
}

interface DiscordPreviewCardProps {
  previewDetails: string;
  previewState: string;
  noDetailsText: string;
}

const DiscordPreviewCard = ({
  previewDetails,
  previewState,
  noDetailsText,
}: DiscordPreviewCardProps) => (
  <div className='rounded-xl bg-[#1e1f24] p-4 text-white shadow-sm'>
    <div className='mb-3 flex items-center justify-between gap-3'>
      <p className='font-semibold text-sm'>Playing</p>
      <div className='flex gap-1'>
        <span className='size-1 rounded-full bg-white/35' />
        <span className='size-1 rounded-full bg-white/35' />
        <span className='size-1 rounded-full bg-white/35' />
      </div>
    </div>
    <div className='flex gap-3'>
      <img
        alt='Deadlock'
        className='size-16 shrink-0 rounded-xl object-cover'
        src={PREVIEW_LARGE_IMAGE_URL}
      />
      <div className='min-w-0 py-0.5'>
        <p className='truncate font-semibold text-sm'>Deadlock</p>
        <p className='truncate text-sm text-white/90'>
          {previewDetails || noDetailsText}
        </p>
        {previewState && (
          <p className='truncate text-sm text-white/90'>{previewState}</p>
        )}
        <p className='mt-1 text-emerald-300 text-sm tabular-nums'>
          3 / 6 · 01:24
        </p>
      </div>
    </div>
  </div>
);

export const GamePresenceSettings = () => {
  const { t } = useTranslation();
  const gamePresenceEnabled = usePersistedStore(
    (state) => state.gamePresenceEnabled,
  );
  const setGamePresenceEnabled = usePersistedStore(
    (state) => state.setGamePresenceEnabled,
  );
  const gamePresenceTextTemplates = usePersistedStore(
    (state) => state.gamePresenceTextTemplates,
  );
  const setGamePresenceTextTemplates = usePersistedStore(
    (state) => state.setGamePresenceTextTemplates,
  );
  const gamePresenceHeroOverrides = usePersistedStore(
    (state) => state.gamePresenceHeroOverrides,
  );
  const setGamePresenceHeroOverrides = usePersistedStore(
    (state) => state.setGamePresenceHeroOverrides,
  );
  const [draftTemplates, setDraftTemplates] = useState(
    gamePresenceTextTemplates,
  );
  const [draftHeroOverrides, setDraftHeroOverrides] = useState(
    gamePresenceHeroOverrides,
  );
  const [selectedKey, setSelectedKey] = useState<TemplateKey>("soloHideout");
  const [selectedHeroCodename, setSelectedHeroCodename] = useState<
    string | null
  >(null);
  const [heroes, setHeroes] = useState<GamePresenceHero[]>([]);

  const prevTemplatesRef = useRef(gamePresenceTextTemplates);
  if (prevTemplatesRef.current !== gamePresenceTextTemplates) {
    prevTemplatesRef.current = gamePresenceTextTemplates;
    setDraftTemplates(gamePresenceTextTemplates);
  }

  const prevHeroOverridesRef = useRef(gamePresenceHeroOverrides);
  if (prevHeroOverridesRef.current !== gamePresenceHeroOverrides) {
    prevHeroOverridesRef.current = gamePresenceHeroOverrides;
    setDraftHeroOverrides(gamePresenceHeroOverrides);
  }

  useEffect(() => {
    let cancelled = false;

    invoke<GamePresenceHero[]>("get_game_presence_heroes")
      .then((payload) => {
        if (!cancelled) {
          setHeroes(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRow =
    TEMPLATE_ROWS.find((row) => row.key === selectedKey) ?? TEMPLATE_ROWS[0];

  const selectedHero = useMemo(() => {
    if (selectedHeroCodename === null) {
      return null;
    }

    return (
      heroes.find((hero) => hero.codename === selectedHeroCodename) ?? {
        codename: selectedHeroCodename,
        name: selectedHeroCodename,
        hideoutText: "",
      }
    );
  }, [heroes, selectedHeroCodename]);

  const selectedHeroTemplates =
    selectedHeroCodename === null
      ? null
      : (draftHeroOverrides[selectedHeroCodename] ??
        createDefaultGamePresenceTextTemplates());
  const selectedTemplates = selectedHeroTemplates ?? draftTemplates;
  const selectedTemplate = selectedTemplates[selectedRow.key];
  const selectedGlobalTemplate = draftTemplates[selectedRow.key];
  const hasSelectedHeroOverride =
    selectedHeroCodename !== null &&
    draftHeroOverrides[selectedHeroCodename] !== undefined;

  const rowsWithHeroOverrides = useMemo(() => {
    const heroTemplatesList = Object.values(draftHeroOverrides);
    const result = new Set<TemplateKey>();
    for (const templates of heroTemplatesList) {
      for (const row of TEMPLATE_ROWS) {
        if (
          templates[row.key].details.trim() !== "" ||
          templates[row.key].state.trim() !== ""
        ) {
          result.add(row.key);
        }
      }
    }
    return result;
  }, [draftHeroOverrides]);

  const hasUnsavedChanges = useMemo(
    () =>
      JSON.stringify(draftTemplates) !==
        JSON.stringify(gamePresenceTextTemplates) ||
      JSON.stringify(draftHeroOverrides) !==
        JSON.stringify(gamePresenceHeroOverrides),
    [
      draftTemplates,
      gamePresenceTextTemplates,
      draftHeroOverrides,
      gamePresenceHeroOverrides,
    ],
  );

  const sampleValues: SamplePresenceValues = useMemo(
    () =>
      selectedHero === null
        ? DEFAULT_SAMPLE_VALUES
        : {
            ...DEFAULT_SAMPLE_VALUES,
            hero: selectedHero.name,
            heroPresence:
              selectedHero.hideoutText.trim() !== ""
                ? selectedHero.hideoutText
                : `${selectedHero.name} in the Hideout`,
          },
    [selectedHero],
  );

  const effectiveDetails =
    selectedHeroCodename !== null && selectedTemplate.details.trim() === ""
      ? selectedGlobalTemplate.details
      : selectedTemplate.details;
  const effectiveState =
    selectedHeroCodename !== null && selectedTemplate.state.trim() === ""
      ? selectedGlobalTemplate.state
      : selectedTemplate.state;
  const previewDetails = renderPreviewText(
    effectiveDetails,
    selectedRow.defaultDetails,
    sampleValues,
  );
  const previewState = renderPreviewText(
    effectiveState,
    selectedRow.defaultState,
    sampleValues,
  );

  const updateDraftField = (
    key: TemplateKey,
    field: TemplateField,
    value: string,
  ) => {
    if (selectedHeroCodename !== null) {
      setDraftHeroOverrides((current) => {
        const currentTemplates =
          current[selectedHeroCodename] ??
          createDefaultGamePresenceTextTemplates();

        return {
          ...current,
          [selectedHeroCodename]: {
            ...currentTemplates,
            [key]: {
              ...currentTemplates[key],
              [field]: value,
            },
          },
        };
      });
      return;
    }

    setDraftTemplates((current: PresenceTextTemplates) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  };

  const resetDraftRow = (key: TemplateKey) => {
    updateDraftField(key, "details", "");
    updateDraftField(key, "state", "");
  };

  const removeSelectedHeroOverride = () => {
    if (selectedHeroCodename === null) {
      return;
    }

    setDraftHeroOverrides((current) => {
      const next = { ...current };
      delete next[selectedHeroCodename];
      return next;
    });
  };

  const insertPlaceholder = (field: TemplateField, placeholder: string) => {
    updateDraftField(
      selectedRow.key,
      field,
      `${selectedTemplate[field]}${placeholder}`,
    );
  };

  const saveTemplates = () => {
    setGamePresenceTextTemplates(draftTemplates);
    setGamePresenceHeroOverrides(draftHeroOverrides);
    toast.success(t("gamePresence.templatesSaved"));
  };

  const resetAllTemplates = () => {
    setDraftTemplates(createDefaultGamePresenceTextTemplates());
    setDraftHeroOverrides({});
  };

  const discardChanges = () => {
    setDraftTemplates(gamePresenceTextTemplates);
    setDraftHeroOverrides(gamePresenceHeroOverrides);
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='rounded-lg border border-border/50 bg-background/60 p-4'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='space-y-1'>
            <Label className='font-semibold text-base'>
              {t("gamePresence.title")}
            </Label>
            <p className='max-w-[72ch] text-muted-foreground text-sm text-pretty'>
              {t("gamePresence.description")}
            </p>
          </div>

          <div className='flex items-center gap-2'>
            <Switch
              checked={gamePresenceEnabled}
              id='toggle-game-presence'
              onCheckedChange={setGamePresenceEnabled}
            />
            <Label className='text-sm' htmlFor='toggle-game-presence'>
              {gamePresenceEnabled ? t("status.enabled") : t("status.disabled")}
            </Label>
          </div>
        </div>
      </div>

      <div className='rounded-xl border border-border/50 bg-card/50 p-4 shadow-sm'>
        <div className='flex flex-col gap-3 border-border/50 border-b pb-4 xl:flex-row xl:items-start xl:justify-between'>
          <div className='space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h3 className='font-semibold text-base text-foreground'>
                {t("gamePresence.templatesTitle")}
              </h3>
            </div>
            <p className='max-w-[72ch] text-muted-foreground text-sm text-pretty'>
              {t("gamePresence.templatesDescription")}
            </p>
          </div>
          <div className='flex flex-wrap gap-2 justify-end'>
            <Button
              disabled={!hasUnsavedChanges}
              onClick={discardChanges}
              size='sm'
              type='button'
              variant='outline'>
              <Trash className='size-4' />
              {t("gamePresence.discardChanges")}
            </Button>
            <Button
              onClick={resetAllTemplates}
              size='sm'
              type='button'
              variant='outline'>
              <RotateCcw className='size-4' />
              {t("gamePresence.resetAll")}
            </Button>
            <Button
              disabled={!hasUnsavedChanges}
              onClick={saveTemplates}
              size='sm'
              type='button'>
              <Save className='size-4' />
              {t("gamePresence.saveTemplates")}
            </Button>
          </div>
        </div>

        <Tabs
          className='mt-4 flex flex-col gap-4'
          onValueChange={(value) => setSelectedKey(coerceTemplateKey(value))}
          value={selectedKey}>
          <TabsList className='flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border/50 bg-background/40 p-1'>
            {TEMPLATE_ROWS.map((row) => {
              const hasGlobalContent =
                draftTemplates[row.key].details.trim() !== "" ||
                draftTemplates[row.key].state.trim() !== "";
              const hasAnyHeroOverride = rowsWithHeroOverrides.has(row.key);

              return (
                <TabsTrigger
                  className='h-8 gap-1.5 rounded-md px-3 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-foreground data-[state=active]:shadow-none'
                  key={row.key}
                  value={row.key}>
                  <span>{t(row.phaseKey)}</span>
                  {(hasGlobalContent || hasAnyHeroOverride) && (
                    <span className='size-1.5 rounded-full bg-primary' />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent className='mt-0' value={selectedRow.key}>
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]'>
              <div className='rounded-lg border border-border/50 bg-background/40 p-4'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h4 className='font-semibold text-foreground text-lg'>
                        {t(selectedRow.phaseKey)}
                      </h4>
                      {hasSelectedHeroOverride && (
                        <Badge variant='outline'>
                          {t("gamePresence.heroOverrides.overrideActive")}
                        </Badge>
                      )}
                    </div>
                    <p className='text-muted-foreground text-sm text-pretty'>
                      {t(selectedRow.descriptionKey)}
                    </p>
                  </div>

                  <div className='w-full space-y-2 sm:w-52 sm:shrink-0'>
                    <Label className='text-xs'>
                      {t("gamePresence.heroOverrides.scopeLabel")}
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        setSelectedHeroCodename(
                          value === GLOBAL_SCOPE_VALUE ? null : value,
                        )
                      }
                      value={selectedHeroCodename ?? GLOBAL_SCOPE_VALUE}>
                      <SelectTrigger className='bg-background/70'>
                        <SelectValue
                          placeholder={t(
                            "gamePresence.heroOverrides.selectHero",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={GLOBAL_SCOPE_VALUE}>
                            {t("gamePresence.heroOverrides.globalTemplates")}
                          </SelectItem>
                          {heroes.map((hero) => {
                            const hasOverride =
                              draftHeroOverrides[hero.codename] !== undefined;

                            return (
                              <SelectItem
                                key={hero.codename}
                                value={hero.codename}>
                                <span className='flex items-center gap-1.5'>
                                  {hero.name}
                                  {hasOverride && (
                                    <span className='size-1.5 rounded-full bg-primary' />
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedHero !== null && (
                  <div className='mt-4 rounded-lg border border-border/50 bg-card/40 p-3'>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='space-y-1'>
                        <p className='font-medium text-sm'>
                          {t("gamePresence.heroOverrides.title")}
                        </p>
                        <p className='text-muted-foreground text-sm text-pretty'>
                          {hasSelectedHeroOverride
                            ? t("gamePresence.heroOverrides.description")
                            : t("gamePresence.heroOverrides.noOverride")}
                        </p>
                      </div>
                      <Button
                        disabled={!hasSelectedHeroOverride}
                        onClick={removeSelectedHeroOverride}
                        size='sm'
                        type='button'
                        variant='outline'>
                        <RotateCcw className='size-4' />
                        {t("gamePresence.heroOverrides.removeOverride")}
                      </Button>
                    </div>
                  </div>
                )}

                <div className='mt-4 grid gap-5'>
                  <TemplateFieldEditor
                    field='details'
                    onInsertPlaceholder={insertPlaceholder}
                    onUpdate={updateDraftField}
                    selectedGlobalTemplate={selectedGlobalTemplate}
                    selectedHeroCodename={selectedHeroCodename}
                    selectedRow={selectedRow}
                    selectedTemplate={selectedTemplate}
                    t={t}
                  />
                  <TemplateFieldEditor
                    field='state'
                    onInsertPlaceholder={insertPlaceholder}
                    onUpdate={updateDraftField}
                    selectedGlobalTemplate={selectedGlobalTemplate}
                    selectedHeroCodename={selectedHeroCodename}
                    selectedRow={selectedRow}
                    selectedTemplate={selectedTemplate}
                    t={t}
                  />
                </div>

                <div className='mt-5 flex justify-end'>
                  <Button
                    onClick={() => resetDraftRow(selectedRow.key)}
                    size='sm'
                    type='button'
                    variant='ghost'>
                    <RotateCcw className='size-4' />
                    {t("gamePresence.resetRow")}
                  </Button>
                </div>
              </div>

              <div className='rounded-lg border border-border/50 bg-background/40 p-4'>
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div className='space-y-1'>
                    <h4 className='font-semibold text-base text-foreground'>
                      {t("gamePresence.previewTitle")}
                    </h4>
                    <p className='text-muted-foreground text-sm text-pretty'>
                      {t("gamePresence.previewDescription")}
                    </p>
                  </div>
                </div>

                <DiscordPreviewCard
                  noDetailsText={t("gamePresence.previewNoDetails")}
                  previewDetails={previewDetails}
                  previewState={previewState}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
