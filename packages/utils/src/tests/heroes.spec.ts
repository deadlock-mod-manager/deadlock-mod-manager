import { expect, test } from 'vitest'
import { DeadlockHeroes } from '../constants'
import { guessHero } from '../heroes'

test('guessHero', () => {
  expect(guessHero('Raiden | Yamato Skin')).toBe(DeadlockHeroes.Yamato)
  expect(guessHero('Viscous')).toBe(DeadlockHeroes.Viscous)
  expect(guessHero('Alternative Geist')).toBe(DeadlockHeroes.LadyGeist)
})
