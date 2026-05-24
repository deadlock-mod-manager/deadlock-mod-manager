import { DeadlockHeroes } from "../constants";
import type { HeroDefinitions } from "./types";

export const SKINS_SUPER_CATEGORY = "Skins";

export const GENERIC_SKIN_CATEGORIES = new Set(["Skins", "Other"]);

export const HERO_DEFINITIONS: HeroDefinitions = {
  [DeadlockHeroes.Abrams]: {
    aliases: ["atlas", "atlas detective", "atlas detective v2"],
    fuzzyTokens: ["brams"],
  },
  [DeadlockHeroes.Apollo]: { aliases: ["fencer"] },
  [DeadlockHeroes.Bebop]: {},
  [DeadlockHeroes.Billy]: { aliases: ["punkgoat"] },
  [DeadlockHeroes.Calico]: { aliases: ["cadence", "nano"] },
  [DeadlockHeroes.Celeste]: { aliases: ["unicorn"] },
  [DeadlockHeroes.Doorman]: { aliases: ["doorman v2"] },
  [DeadlockHeroes.Drifter]: {},
  [DeadlockHeroes.Dynamo]: { aliases: ["prof dynamo"] },
  [DeadlockHeroes.Graves]: { aliases: ["necro"] },
  [DeadlockHeroes.GreyTalon]: {
    aliases: ["archer", "archer v2", "greytalon"],
    fuzzyTokens: ["talon"],
    phrases: [["grey", "talon"]],
  },
  [DeadlockHeroes.Haze]: { aliases: ["haze v2"] },
  [DeadlockHeroes.Holliday]: { aliases: ["astro"] },
  [DeadlockHeroes.Infernus]: {
    aliases: ["inferno", "inferno v4"],
    fuzzyTokens: ["fernus"],
  },
  [DeadlockHeroes.Ivy]: { aliases: ["tengu"] },
  [DeadlockHeroes.Kelvin]: { aliases: ["kelvin explorer", "kelvin v2"] },
  [DeadlockHeroes.LadyGeist]: {
    aliases: ["geist", "ghost", "ladygeist"],
    fuzzyTokens: ["geist", "gaist"],
    phrases: [["lady", "geist"]],
    regexSnippets: ["lady[^a-z0-9]*geist"],
  },
  [DeadlockHeroes.Lash]: { aliases: ["lash v2"] },
  [DeadlockHeroes.McGinnis]: { aliases: ["engineer"] },
  [DeadlockHeroes.Mina]: { aliases: ["vampirebat"] },
  [DeadlockHeroes.Mirage]: { aliases: ["mirage v2"] },
  [DeadlockHeroes.MoKrill]: {
    aliases: ["digger", "mo krill", "mokrill"],
    fuzzyTokens: ["krill"],
    phrases: [
      ["mo", "krill"],
      ["mo", "and", "krill"],
    ],
    regexSnippets: ["mo[^a-z0-9]*krill"],
  },
  [DeadlockHeroes.Paige]: { aliases: ["bookworm"] },
  [DeadlockHeroes.Paradox]: {
    aliases: ["chrono"],
    fuzzyTokens: ["dox"],
  },
  [DeadlockHeroes.Pocket]: { aliases: ["synth"] },
  [DeadlockHeroes.Rem]: { aliases: ["familiar"] },
  [DeadlockHeroes.Seven]: {
    aliases: ["7", "gigawatt", "gigawatt prisoner"],
  },
  [DeadlockHeroes.Shiv]: { aliases: ["shiv ult"] },
  [DeadlockHeroes.Silver]: { aliases: ["werewolf"] },
  [DeadlockHeroes.Sinclair]: { aliases: ["magician", "magician v2"] },
  [DeadlockHeroes.Venator]: { aliases: ["priest"] },
  [DeadlockHeroes.Victor]: { aliases: ["frank", "frank v2", "viktor"] },
  [DeadlockHeroes.Vindicta]: { aliases: ["hornet", "hornet v3"] },
  [DeadlockHeroes.Viscous]: {},
  [DeadlockHeroes.Vyper]: { aliases: ["viper"] },
  [DeadlockHeroes.Warden]: {},
  [DeadlockHeroes.Wraith]: {
    aliases: ["wraith gen man", "wraith magician", "wraith puppeteer"],
  },
  [DeadlockHeroes.Wrecker]: { aliases: ["butcher"] },
  [DeadlockHeroes.Yamato]: { aliases: ["yamato v2"] },
};
