import { DeadlockHeroes, DeadlockHeroesByAlias } from './constants';

const knownRegexes = {
  [DeadlockHeroes.Abrams]: [/abrams/i, /brams/i],
  [DeadlockHeroes.Bebop]: [/bebop/i],
  [DeadlockHeroes.Billy]: [/billy/i],
  [DeadlockHeroes.Calico]: [/calico/i],
  [DeadlockHeroes.Doorman]: [/doorman/i],
  [DeadlockHeroes.Drifter]: [/drifter/i],
  [DeadlockHeroes.Dynamo]: [/dynamo/i],
  [DeadlockHeroes.GreyTalon]: [/talon/i, /grey talon/i],
  [DeadlockHeroes.Haze]: [/haze/i],
  [DeadlockHeroes.Holliday]: [/holliday/i],
  [DeadlockHeroes.Infernus]: [/infernus/i, /fernus/i],
  [DeadlockHeroes.Ivy]: [/ivy/i],
  [DeadlockHeroes.Kelvin]: [/kelvin/i],
  [DeadlockHeroes.LadyGeist]: [/geist/i, /gaist/i, /lady/i, /lady geist/i],
  [DeadlockHeroes.Lash]: [/lash/i],
  [DeadlockHeroes.McGinnis]: [/mcginnis/i],
  [DeadlockHeroes.Mina]: [/mina/i],
  [DeadlockHeroes.Mirage]: [/mirage/i],
  [DeadlockHeroes.MoKrill]: [/krill/i, /mo & krill/i, /mo and krill/i],
  [DeadlockHeroes.Paige]: [/paige/i],
  [DeadlockHeroes.Paradox]: [/paradox/i, /dox/i],
  [DeadlockHeroes.Pocket]: [/pocket/i],
  [DeadlockHeroes.Seven]: [/seven/i],
  [DeadlockHeroes.Shiv]: [/shiv/i],
  [DeadlockHeroes.Sinclair]: [/sinclair/i],
  [DeadlockHeroes.Vindicta]: [/vindicta/i],
  [DeadlockHeroes.Viscous]: [/viscous/i],
  [DeadlockHeroes.Vyper]: [/vyper/i, /viper/i],
  [DeadlockHeroes.Warden]: [/warden/i],
  [DeadlockHeroes.Wraith]: [/wraith/i],
  [DeadlockHeroes.Yamato]: [/yamato/i],
};

export const guessHero = (value: string): DeadlockHeroes | null => {
  for (const [hero, regex] of Object.entries(knownRegexes)) {
    if (regex.some((r) => r.test(value.toLowerCase()))) {
      return DeadlockHeroes[
        DeadlockHeroesByAlias[hero] as keyof typeof DeadlockHeroes
      ];
    }
  }
  return null;
};
