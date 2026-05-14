import { DeadlockHeroes, DeadlockHeroesByAlias } from "./constants";

const normalizeHeroKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toHero = (hero: DeadlockHeroes): DeadlockHeroes =>
  DeadlockHeroes[DeadlockHeroesByAlias[hero] as keyof typeof DeadlockHeroes];

const knownAliases = new Map<string, DeadlockHeroes>();

const addAliases = (hero: DeadlockHeroes, aliases: string[]) => {
  for (const alias of [hero, DeadlockHeroesByAlias[hero], ...aliases]) {
    knownAliases.set(normalizeHeroKey(alias), toHero(hero));
  }
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const tokenPattern = (pattern: string): RegExp =>
  new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, "i");

const word = (value: string): RegExp => tokenPattern(escapeRegex(value));

const phrase = (...parts: string[]): RegExp =>
  tokenPattern(parts.map(escapeRegex).join("[^a-z0-9]+"));

addAliases(DeadlockHeroes.Abrams, [
  "atlas",
  "atlas detective",
  "atlas detective v2",
]);
addAliases(DeadlockHeroes.Apollo, ["fencer"]);
addAliases(DeadlockHeroes.Bebop, []);
addAliases(DeadlockHeroes.Billy, ["punkgoat"]);
addAliases(DeadlockHeroes.Calico, ["cadence", "nano"]);
addAliases(DeadlockHeroes.Celeste, ["unicorn"]);
addAliases(DeadlockHeroes.Doorman, ["doorman v2"]);
addAliases(DeadlockHeroes.Drifter, []);
addAliases(DeadlockHeroes.Dynamo, ["prof dynamo"]);
addAliases(DeadlockHeroes.Graves, ["necro"]);
addAliases(DeadlockHeroes.GreyTalon, ["archer", "archer v2", "greytalon"]);
addAliases(DeadlockHeroes.Haze, ["haze v2"]);
addAliases(DeadlockHeroes.Holliday, ["astro"]);
addAliases(DeadlockHeroes.Infernus, ["inferno", "inferno v4"]);
addAliases(DeadlockHeroes.Ivy, ["tengu"]);
addAliases(DeadlockHeroes.Kelvin, ["kelvin explorer", "kelvin v2"]);
addAliases(DeadlockHeroes.LadyGeist, ["geist", "ghost", "ladygeist"]);
addAliases(DeadlockHeroes.Lash, ["lash v2"]);
addAliases(DeadlockHeroes.McGinnis, ["engineer"]);
addAliases(DeadlockHeroes.Mina, ["vampirebat"]);
addAliases(DeadlockHeroes.Mirage, ["mirage v2"]);
addAliases(DeadlockHeroes.MoKrill, ["digger", "mo krill", "mokrill"]);
addAliases(DeadlockHeroes.Paige, ["bookworm"]);
addAliases(DeadlockHeroes.Paradox, ["chrono"]);
addAliases(DeadlockHeroes.Pocket, ["synth"]);
addAliases(DeadlockHeroes.Rem, ["familiar"]);
addAliases(DeadlockHeroes.Seven, ["7", "gigawatt", "gigawatt prisoner"]);
addAliases(DeadlockHeroes.Shiv, ["shiv ult"]);
addAliases(DeadlockHeroes.Silver, ["werewolf"]);
addAliases(DeadlockHeroes.Sinclair, ["magician", "magician v2"]);
addAliases(DeadlockHeroes.Venator, ["priest"]);
addAliases(DeadlockHeroes.Victor, ["frank", "frank v2", "viktor"]);
addAliases(DeadlockHeroes.Vindicta, ["hornet", "hornet v3"]);
addAliases(DeadlockHeroes.Viscous, []);
addAliases(DeadlockHeroes.Vyper, ["viper"]);
addAliases(DeadlockHeroes.Warden, []);
addAliases(DeadlockHeroes.Wraith, [
  "wraith gen man",
  "wraith magician",
  "wraith puppeteer",
]);
addAliases(DeadlockHeroes.Wrecker, ["butcher"]);
addAliases(DeadlockHeroes.Yamato, ["yamato v2"]);

const knownRegexes = {
  [DeadlockHeroes.Abrams]: [word("abrams"), word("brams")],
  [DeadlockHeroes.Apollo]: [word("apollo")],
  [DeadlockHeroes.Bebop]: [word("bebop")],
  [DeadlockHeroes.Billy]: [word("billy")],
  [DeadlockHeroes.Calico]: [word("calico")],
  [DeadlockHeroes.Celeste]: [word("celeste")],
  [DeadlockHeroes.Doorman]: [word("doorman")],
  [DeadlockHeroes.Drifter]: [word("drifter")],
  [DeadlockHeroes.Dynamo]: [word("dynamo")],
  [DeadlockHeroes.Graves]: [word("graves")],
  [DeadlockHeroes.GreyTalon]: [word("talon"), phrase("grey", "talon")],
  [DeadlockHeroes.Haze]: [word("haze")],
  [DeadlockHeroes.Holliday]: [word("holliday")],
  [DeadlockHeroes.Infernus]: [word("infernus"), word("fernus")],
  [DeadlockHeroes.Ivy]: [word("ivy")],
  [DeadlockHeroes.Kelvin]: [word("kelvin")],
  [DeadlockHeroes.LadyGeist]: [
    word("geist"),
    word("gaist"),
    phrase("lady", "geist"),
    tokenPattern("lady[^a-z0-9]*geist"),
  ],
  [DeadlockHeroes.Lash]: [word("lash")],
  [DeadlockHeroes.McGinnis]: [word("mcginnis")],
  [DeadlockHeroes.Mina]: [word("mina")],
  [DeadlockHeroes.Mirage]: [word("mirage")],
  [DeadlockHeroes.MoKrill]: [
    word("krill"),
    phrase("mo", "krill"),
    phrase("mo", "and", "krill"),
    tokenPattern("mo[^a-z0-9]*krill"),
  ],
  [DeadlockHeroes.Paige]: [word("paige")],
  [DeadlockHeroes.Paradox]: [word("paradox"), word("dox")],
  [DeadlockHeroes.Pocket]: [word("pocket")],
  [DeadlockHeroes.Rem]: [word("rem")],
  [DeadlockHeroes.Seven]: [word("seven"), word("7")],
  [DeadlockHeroes.Shiv]: [word("shiv")],
  [DeadlockHeroes.Silver]: [word("silver")],
  [DeadlockHeroes.Sinclair]: [word("sinclair")],
  [DeadlockHeroes.Venator]: [word("venator")],
  [DeadlockHeroes.Victor]: [word("victor"), word("viktor")],
  [DeadlockHeroes.Vindicta]: [word("vindicta")],
  [DeadlockHeroes.Viscous]: [word("viscous")],
  [DeadlockHeroes.Vyper]: [word("vyper"), word("viper")],
  [DeadlockHeroes.Warden]: [word("warden")],
  [DeadlockHeroes.Wraith]: [word("wraith")],
  [DeadlockHeroes.Wrecker]: [word("wrecker")],
  [DeadlockHeroes.Yamato]: [word("yamato")],
};

export const normalizeHero = (
  value: string | null | undefined,
): DeadlockHeroes | null => {
  if (!value) return null;
  return knownAliases.get(normalizeHeroKey(value)) ?? null;
};

export const guessHero = (value: string): DeadlockHeroes | null => {
  const exactHero = normalizeHero(value);
  if (exactHero) return exactHero;

  for (const [hero, regex] of Object.entries(knownRegexes)) {
    if (regex.some((r) => r.test(value.toLowerCase()))) {
      return DeadlockHeroes[
        DeadlockHeroesByAlias[hero] as keyof typeof DeadlockHeroes
      ];
    }
  }
  return null;
};
