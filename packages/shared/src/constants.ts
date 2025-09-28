export enum DeadlockHeroes {
  Abrams = "Abrams",
  Bebop = "Bebop",
  Billy = "Billy",
  Calico = "Calico",
  Doorman = "Doorman",
  Drifter = "Drifter",
  Dynamo = "Dynamo",
  GreyTalon = "Grey Talon",
  Haze = "Haze",
  Holliday = "Holliday",
  Infernus = "Infernus",
  Ivy = "Ivy",
  Kelvin = "Kelvin",
  LadyGeist = "Lady Geist",
  Lash = "Lash",
  McGinnis = "McGinnis",
  Mina = "Mina",
  Mirage = "Mirage",
  MoKrill = "Mo & Krill",
  Paige = "Paige",
  Paradox = "Paradox",
  Pocket = "Pocket",
  Seven = "Seven",
  Shiv = "Shiv",
  Sinclair = "Sinclair",
  Victor = "Victor",
  Vindicta = "Vindicta",
  Viscous = "Viscous",
  Vyper = "Vyper",
  Warden = "Warden",
  Wraith = "Wraith",
  Yamato = "Yamato",
}

export const DeadlockHeroesByAlias = Object.keys(DeadlockHeroes).reduce(
  (acc: Record<string, string>, key) => {
    acc[DeadlockHeroes[key as keyof typeof DeadlockHeroes]] = key;
    return acc;
  },
  {},
);

export enum CustomSettingType {
  LAUNCH_OPTION = "launch_option",
}

export const customSettingTypeHuman: Record<
  CustomSettingType,
  { title: string; description: string }
> = {
  [CustomSettingType.LAUNCH_OPTION]: {
    title: "Custom Launch Options",
    description:
      "Customize the launch options for the game. These are applied regardless of the game mode selected (Vanilla or Modded).",
  },
};
