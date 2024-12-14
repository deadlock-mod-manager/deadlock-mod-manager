export enum DeadlockHeroes {
  Abrams = 'Abrams',
  Bebop = 'Bebop',
  Dynamo = 'Dynamo',
  GreyTalon = 'Grey Talon',
  Haze = 'Haze',
  Infernus = 'Infernus',
  Ivy = 'Ivy',
  Kelvin = 'Kelvin',
  LadyGeist = 'Lady Geist',
  Lash = 'Lash',
  McGinnis = 'McGinnis',
  MoKrill = 'Mo & Krill',
  Paradox = 'Paradox',
  Pocket = 'Pocket',
  Seven = 'Seven',
  Shiv = 'Shiv',
  Vindicta = 'Vindicta',
  Viscous = 'Viscous',
  Wraith = 'Wraith',
  Yamato = 'Yamato',
  // Hero Labs
  Holliday = 'Holliday',
  Viper = 'Viper',
  Calico = 'Calico',
  Fathom = 'Fathom',
  Magician = 'Magician',
  Raven = 'Raven',
  Trapper = 'Trapper',
  Wrecker = 'Wrecker'
}

export const DeadlockHeroesByAlias = Object.keys(DeadlockHeroes).reduce((acc: Record<string, string>, key) => {
  acc[DeadlockHeroes[key as keyof typeof DeadlockHeroes]] = key
  return acc
}, {})
