import { prisma } from '@deadlock-mods/database'
import { toModDto } from '@deadlock-mods/utils'
import { Hono } from 'hono'

const mods = new Hono()

mods.get('/', async (c) => {
  const mods = await prisma.mod.findMany()
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return c.json(mods.map(toModDto))
})

export default mods
