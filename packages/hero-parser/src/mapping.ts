type HeroMapping = {
  enumKey: string;
  displayName: string;
};

const HERO_MAP: Record<string, HeroMapping> = {
  // heroes_wip
  abrams: { enumKey: "Abrams", displayName: "Abrams" },
  bookworm: { enumKey: "Paige", displayName: "Paige" },
  doorman: { enumKey: "Doorman", displayName: "Doorman" },
  doorman_v2: { enumKey: "Doorman", displayName: "Doorman" },
  drifter: { enumKey: "Drifter", displayName: "Drifter" },
  dynamo: { enumKey: "Dynamo", displayName: "Dynamo" },
  familiar: { enumKey: "Rem", displayName: "Rem" },
  fencer: { enumKey: "Apollo", displayName: "Apollo" },
  frank: { enumKey: "Victor", displayName: "Victor" },
  frank_v2: { enumKey: "Victor", displayName: "Victor" },
  geist: { enumKey: "LadyGeist", displayName: "Lady Geist" },
  haze: { enumKey: "Haze", displayName: "Haze" },
  inferno: { enumKey: "Infernus", displayName: "Infernus" },
  ivy: { enumKey: "Ivy", displayName: "Ivy" },
  lash: { enumKey: "Lash", displayName: "Lash" },
  mcginnis: { enumKey: "McGinnis", displayName: "McGinnis" },
  necro: { enumKey: "Graves", displayName: "Graves" },
  pocket: { enumKey: "Pocket", displayName: "Pocket" },
  priest: { enumKey: "Venator", displayName: "Venator" },
  punkgoat: { enumKey: "Billy", displayName: "Billy" },
  unicorn: { enumKey: "Celeste", displayName: "Celeste" },
  vampirebat: { enumKey: "Mina", displayName: "Mina" },
  werewolf: { enumKey: "Silver", displayName: "Silver" },
  wraith: { enumKey: "Wraith", displayName: "Wraith" },
  yamato: { enumKey: "Yamato", displayName: "Yamato" },
  // heroes_staging
  archer: { enumKey: "GreyTalon", displayName: "Grey Talon" },
  archer_v2: { enumKey: "GreyTalon", displayName: "Grey Talon" },
  astro: { enumKey: "Holliday", displayName: "Holliday" },
  atlas_detective: { enumKey: "Abrams", displayName: "Abrams" },
  atlas_detective_v2: { enumKey: "Abrams", displayName: "Abrams" },
  bebop: { enumKey: "Bebop", displayName: "Bebop" },
  butcher: { enumKey: "Wrecker", displayName: "Wrecker" },
  chrono: { enumKey: "Paradox", displayName: "Paradox" },
  digger: { enumKey: "MoKrill", displayName: "Mo & Krill" },
  engineer: { enumKey: "McGinnis", displayName: "McGinnis" },
  ghost: { enumKey: "LadyGeist", displayName: "Lady Geist" },
  gigawatt: { enumKey: "Seven", displayName: "Seven" },
  gigawatt_prisoner: { enumKey: "Seven", displayName: "Seven" },
  grey_talon: { enumKey: "GreyTalon", displayName: "Grey Talon" },
  haze_v2: { enumKey: "Haze", displayName: "Haze" },
  hornet_v3: { enumKey: "Vindicta", displayName: "Vindicta" },
  inferno_v4: { enumKey: "Infernus", displayName: "Infernus" },
  kelvin: { enumKey: "Kelvin", displayName: "Kelvin" },
  kelvin_explorer: { enumKey: "Kelvin", displayName: "Kelvin" },
  kelvin_v2: { enumKey: "Kelvin", displayName: "Kelvin" },
  lash_v2: { enumKey: "Lash", displayName: "Lash" },
  magician: { enumKey: "Sinclair", displayName: "Sinclair" },
  magician_v2: { enumKey: "Sinclair", displayName: "Sinclair" },
  mirage: { enumKey: "Mirage", displayName: "Mirage" },
  mirage_v2: { enumKey: "Mirage", displayName: "Mirage" },
  nano: { enumKey: "Calico", displayName: "Calico" },
  prof_dynamo: { enumKey: "Dynamo", displayName: "Dynamo" },
  shiv: { enumKey: "Shiv", displayName: "Shiv" },
  shiv_ult: { enumKey: "Shiv", displayName: "Shiv" },
  synth: { enumKey: "Pocket", displayName: "Pocket" },
  tengu: { enumKey: "Ivy", displayName: "Ivy" },
  vindicta: { enumKey: "Vindicta", displayName: "Vindicta" },
  viper: { enumKey: "Vyper", displayName: "Vyper" },
  viscous: { enumKey: "Viscous", displayName: "Viscous" },
  warden: { enumKey: "Warden", displayName: "Warden" },
  wraith_gen_man: { enumKey: "Wraith", displayName: "Wraith" },
  wraith_magician: { enumKey: "Wraith", displayName: "Wraith" },
  wraith_puppeteer: { enumKey: "Wraith", displayName: "Wraith" },
  wrecker: { enumKey: "Wrecker", displayName: "Wrecker" },
  yamato_v2: { enumKey: "Yamato", displayName: "Yamato" },
};

const HERO_PATH_PREFIXES = [
  "models/heroes_wip/",
  "models/heroes_staging/",
  "models/heroes/",
];

export function lookupHero(internalName: string): HeroMapping | undefined {
  return HERO_MAP[internalName];
}

export function extractInternalName(path: string): string | undefined {
  for (const prefix of HERO_PATH_PREFIXES) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      const segment = rest.split("/")[0];
      if (segment && segment.length > 0) {
        return segment.toLowerCase();
      }
    }
  }
  return undefined;
}
