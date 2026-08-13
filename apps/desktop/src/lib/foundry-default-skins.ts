export interface DefaultFoundrySkin {
  hero: string;
  image: string;
}

const cardPath = (slug: string): string =>
  `/foundry/default-skins/cards/${slug}.png`;

export const DEFAULT_FOUNDRY_SKINS: readonly DefaultFoundrySkin[] = [
  { hero: "Abrams", image: cardPath("abrams") },
  { hero: "Apollo", image: cardPath("apollo") },
  { hero: "Bebop", image: cardPath("bebop") },
  { hero: "Billy", image: cardPath("billy") },
  { hero: "Calico", image: cardPath("calico") },
  { hero: "Celeste", image: cardPath("celeste") },
  { hero: "Doorman", image: cardPath("doorman") },
  { hero: "Drifter", image: cardPath("drifter") },
  { hero: "Dynamo", image: cardPath("dynamo") },
  { hero: "Graves", image: cardPath("graves") },
  { hero: "Grey Talon", image: cardPath("grey_talon") },
  { hero: "Haze", image: cardPath("haze") },
  { hero: "Holliday", image: cardPath("holliday") },
  { hero: "Infernus", image: cardPath("infernus") },
  { hero: "Ivy", image: cardPath("ivy") },
  { hero: "Kelvin", image: cardPath("kelvin") },
  { hero: "Lady Geist", image: cardPath("lady_geist") },
  { hero: "Lash", image: cardPath("lash") },
  { hero: "McGinnis", image: cardPath("mcginnis") },
  { hero: "Mina", image: cardPath("mina") },
  { hero: "Mirage", image: cardPath("mirage") },
  { hero: "Mo & Krill", image: cardPath("mo_and_krill") },
  { hero: "Paige", image: cardPath("paige") },
  { hero: "Paradox", image: cardPath("paradox") },
  { hero: "Pocket", image: cardPath("pocket") },
  { hero: "Rem", image: cardPath("rem") },
  { hero: "Seven", image: cardPath("seven") },
  { hero: "Shiv", image: cardPath("shiv") },
  { hero: "Silver", image: cardPath("silver") },
  { hero: "Sinclair", image: cardPath("sinclair") },
  { hero: "Venator", image: cardPath("venator") },
  { hero: "Victor", image: cardPath("victor") },
  { hero: "Vindicta", image: cardPath("vindicta") },
  { hero: "Viscous", image: cardPath("viscous") },
  { hero: "Warden", image: cardPath("warden") },
  { hero: "Wraith", image: cardPath("wraith") },
  { hero: "Yamato", image: cardPath("yamato") },
];
