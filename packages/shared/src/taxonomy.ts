import { DeadlockHeroes } from "./constants";

/**
 * Stable hero and content-type IDs that mod sources tag listings with
 * (RFC 002). Published at https://deadlockmods.app/v1/taxonomy.json.
 *
 * IDs are a public contract: never rename or reuse one. Display names may
 * change freely.
 */
export const TAXONOMY_VERSION = 1;

export const HERO_IDS = {
  [DeadlockHeroes.Abrams]: "abrams",
  [DeadlockHeroes.Apollo]: "apollo",
  [DeadlockHeroes.Baba]: "baba",
  [DeadlockHeroes.Bebop]: "bebop",
  [DeadlockHeroes.Billy]: "billy",
  [DeadlockHeroes.Calico]: "calico",
  [DeadlockHeroes.Celeste]: "celeste",
  [DeadlockHeroes.DeadmanDanny]: "deadman-danny",
  [DeadlockHeroes.Doorman]: "doorman",
  [DeadlockHeroes.Drifter]: "drifter",
  [DeadlockHeroes.Dynamo]: "dynamo",
  [DeadlockHeroes.Graves]: "graves",
  [DeadlockHeroes.GreyTalon]: "grey-talon",
  [DeadlockHeroes.Haze]: "haze",
  [DeadlockHeroes.Holliday]: "holliday",
  [DeadlockHeroes.Infernus]: "infernus",
  [DeadlockHeroes.Ivy]: "ivy",
  [DeadlockHeroes.Kelvin]: "kelvin",
  [DeadlockHeroes.LadyGeist]: "lady-geist",
  [DeadlockHeroes.Lash]: "lash",
  [DeadlockHeroes.McGinnis]: "mcginnis",
  [DeadlockHeroes.Mina]: "mina",
  [DeadlockHeroes.Mirage]: "mirage",
  [DeadlockHeroes.MoKrill]: "mo-and-krill",
  [DeadlockHeroes.NurseHarrow]: "nurse-harrow",
  [DeadlockHeroes.Paige]: "paige",
  [DeadlockHeroes.Paradox]: "paradox",
  [DeadlockHeroes.Pocket]: "pocket",
  [DeadlockHeroes.RatKing]: "rat-king",
  [DeadlockHeroes.Rem]: "rem",
  [DeadlockHeroes.Seven]: "seven",
  [DeadlockHeroes.Shiv]: "shiv",
  [DeadlockHeroes.Silver]: "silver",
  [DeadlockHeroes.Sinclair]: "sinclair",
  [DeadlockHeroes.Solomon]: "solomon",
  [DeadlockHeroes.Venator]: "venator",
  [DeadlockHeroes.Victor]: "victor",
  [DeadlockHeroes.Vindicta]: "vindicta",
  [DeadlockHeroes.Violet]: "violet",
  [DeadlockHeroes.Viscous]: "viscous",
  [DeadlockHeroes.Vyper]: "vyper",
  [DeadlockHeroes.Warden]: "warden",
  [DeadlockHeroes.Wraith]: "wraith",
  [DeadlockHeroes.Wrecker]: "wrecker",
  [DeadlockHeroes.Yamato]: "yamato",
} satisfies Record<DeadlockHeroes, string>;

/** The desktop's mod categories, which follow GameBanana's. */
export const CONTENT_TYPES = [
  { id: "skins", name: "Skins" },
  { id: "gameplay", name: "Gameplay" },
  { id: "hud", name: "HUD" },
  { id: "models", name: "Models" },
  { id: "music", name: "Music" },
  { id: "maps", name: "Maps" },
  { id: "ability-sounds", name: "Ability Sounds" },
  { id: "weapon-sounds", name: "Weapon Sounds" },
  { id: "voice-lines", name: "Voice Lines" },
  { id: "kill-sounds", name: "Kill Sounds" },
  { id: "killstreak-music", name: "Killstreak Music" },
  { id: "other", name: "Other" },
] as const;

export type TaxonomyEntry = { id: string; name: string };

export type TaxonomyDocument = {
  format: "dmm-taxonomy";
  version: number;
  heroes: TaxonomyEntry[];
  contentTypes: TaxonomyEntry[];
};

export const buildTaxonomyDocument = (): TaxonomyDocument => ({
  format: "dmm-taxonomy",
  version: TAXONOMY_VERSION,
  heroes: Object.values(DeadlockHeroes).map((hero) => ({
    id: HERO_IDS[hero],
    name: hero,
  })),
  contentTypes: CONTENT_TYPES.map(({ id, name }) => ({ id, name })),
});
