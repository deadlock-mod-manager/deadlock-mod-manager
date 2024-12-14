import { DeadlockHeroes, DeadlockHeroesByAlias } from "./constants"

const knownRegexes = {
  [DeadlockHeroes.Abrams]: [ /abrams/i, /brams/i],
  [DeadlockHeroes.Bebop]: [ /bebop/i],
  [DeadlockHeroes.Dynamo]: [ /dynamo/i],
  [DeadlockHeroes.GreyTalon]: [ /talon/i],
  [DeadlockHeroes.Haze]: [ /haze/i],
  [DeadlockHeroes.Infernus]: [ /fernus/i],
  [DeadlockHeroes.Ivy]: [ /ivy/i],
  [DeadlockHeroes.Kelvin]: [ /kelvin/i],
  [DeadlockHeroes.LadyGeist]: [ /geist/i, /gaist/i, /lady/i],
  [DeadlockHeroes.Lash]: [ /lash/i],
  [DeadlockHeroes.McGinnis]: [ /mcginnis/i],
  [DeadlockHeroes.MoKrill]: [ /krill/i],
  [DeadlockHeroes.Paradox]: [ /paradox/i, /dox/i],
  [DeadlockHeroes.Pocket]: [ /pocket/i],
  [DeadlockHeroes.Seven]: [ /seven/i],
  [DeadlockHeroes.Shiv]: [ /shiv/i],
  [DeadlockHeroes.Vindicta]: [ /vindicta/i],
  [DeadlockHeroes.Viscous]: [ /viscous/i],
  [DeadlockHeroes.Wraith]: [ /wraith/i],
  [DeadlockHeroes.Yamato]: [ /yamato/i],
  [DeadlockHeroes.Holliday]: [ /holliday/i],
  [DeadlockHeroes.Viper]: [ /viper/i],
  [DeadlockHeroes.Calico]: [ /calico/i],
  [DeadlockHeroes.Fathom]: [ /fathom/i],
  [DeadlockHeroes.Magician]: [ /magician/i],
  [DeadlockHeroes.Raven]: [ /raven/i],
  [DeadlockHeroes.Trapper]: [ /trapper/i],
  [DeadlockHeroes.Wrecker]: [ /wrecker/i],
}
 

export const guessHero = (value: string): DeadlockHeroes | null => {
    for (const [hero, regex] of Object.entries(knownRegexes)) {
        if (regex.some(r => r.test(value.toLowerCase()))) {
            return DeadlockHeroes[DeadlockHeroesByAlias[hero] as keyof typeof DeadlockHeroes]
        }
    }
    return null
}


