import { Mod } from "@deadlock-mods/database"

export const toModDto = (mod: Mod) => {
  return mod
}

export type ModDto = ReturnType<typeof toModDto>