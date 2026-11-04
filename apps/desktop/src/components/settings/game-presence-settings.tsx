import {
  TEMPLATE_ROWS,
  DEFAULT_SAMPLE_VALUES,
  coerceTemplateKey,
  renderPreviewText,
  type SamplePresenceValues,
} from "@/components/settings/game-presence/presence-templates";
import type { PresenceTextTemplates } from "@deadlock-mods/deadlock-discord-presence";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
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
import { RotateCcw, Save } from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import { SwitchStatus } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";
import { createDefaultGamePresenceTextTemplates } from "@/lib/store/slices/settings";
import { Trash } from "@phosphor-icons/react";
import type { TemplateKey } from "@/components/settings/game-presence/presence-templates";
import type { TemplateField } from "@/components/settings/game-presence/presence-templates";

import { TemplateFieldEditor } from "@/components/settings/game-presence/template-field-editor";
import { DiscordPreviewCard } from "@/components/settings/game-presence/discord-preview-card";

interface GamePresenceHero {
  codename: string;
  name: string;
  hideoutText: string;
}

const GLOBAL_SCOPE_VALUE = "__global_presence_templates__";

const ENABLE_DESCRIPTION_ID = "toggle-game-presence-description";

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
          <div className='min-w-0 space-y-1'>
            <Label className='font-semibold text-base'>
              {t("gamePresence.title")}
            </Label>
            <p
              className='max-w-[72ch] text-muted-foreground text-sm text-pretty'
              id={ENABLE_DESCRIPTION_ID}>
              {t("gamePresence.description")}
            </p>
          </div>

          <div className='flex shrink-0 items-center gap-2'>
            <Switch
              aria-describedby={ENABLE_DESCRIPTION_ID}
              aria-label={t("gamePresence.title")}
              checked={gamePresenceEnabled}
              id='toggle-game-presence'
              onCheckedChange={setGamePresenceEnabled}
            />
            <SwitchStatus
              checked={gamePresenceEnabled}
              htmlFor='toggle-game-presence'
            />
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
                                  <HeroIcon hero={hero.name} />
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
