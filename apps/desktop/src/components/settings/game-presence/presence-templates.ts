import type {
  PresenceTextTemplatePair,
  PresenceTextTemplates,
} from "@deadlock-mods/deadlock-discord-presence";

export type TemplateKey = Extract<keyof PresenceTextTemplates, string>;

export type TemplateField = keyof PresenceTextTemplatePair;

export interface TemplateRow {
  key: TemplateKey;
  phaseKey: string;
  descriptionKey: string;
  defaultDetails: string;
  defaultState: string;
}

export interface SamplePresenceValues {
  hero: string;
  heroPresence: string;
  mode: string;
  partySize: string;
  partyMax: string;
}

export const TEMPLATE_ROWS: TemplateRow[] = [
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
    defaultState: "Playing Solo as {hero}",
  },
  {
    key: "partyHideout",
    phaseKey: "gamePresence.phases.partyHideout",
    descriptionKey: "gamePresence.phaseDescriptions.partyHideout",
    defaultDetails: "{heroPresence}",
    defaultState: "In Party as {hero}",
  },
  {
    key: "inQueue",
    phaseKey: "gamePresence.phases.inQueue",
    descriptionKey: "gamePresence.phaseDescriptions.inQueue",
    defaultDetails: "Looking for Match...",
    defaultState: "Killing Time as {hero}",
  },
  {
    key: "soloMatch",
    phaseKey: "gamePresence.phases.soloMatch",
    descriptionKey: "gamePresence.phaseDescriptions.soloMatch",
    defaultDetails: "{mode}",
    defaultState: "Playing Solo as {hero}",
  },
  {
    key: "partyMatch",
    phaseKey: "gamePresence.phases.partyMatch",
    descriptionKey: "gamePresence.phaseDescriptions.partyMatch",
    defaultDetails: "{mode}",
    defaultState: "In Party as {hero}",
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

export const DEFAULT_SAMPLE_VALUES: SamplePresenceValues = {
  hero: "Vindicta",
  heroPresence: "Sleep Walking in the Hideout",
  mode: "Playing Standard (6v6)",
  partySize: "3",
  partyMax: "6",
};

export function coerceTemplateKey(value: string): TemplateKey {
  return TEMPLATE_ROWS.find((row) => row.key === value)?.key ?? "soloHideout";
}

export function renderPreviewText(
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
