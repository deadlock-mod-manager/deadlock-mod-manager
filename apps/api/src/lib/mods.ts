import { db, modDownloads, mods } from '@deadlock-mods/database'
import { toModDownloadDto, toModDto } from '@deadlock-mods/utils'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'

const modsRouter = new Hono()

modsRouter.get('/', async (c) => {
  const allMods = await db.select().from(mods)
  return c.json(allMods.map(toModDto))
})

modsRouter.get('/:id', async (c) => {
  const mod = await db.select().from(mods).where(eq(mods.remoteId, c.req.param('id'))).limit(1)
  if (mod.length === 0) {
    return c.json({ error: 'Mod not found' }, 404)
  }
  return c.json(toModDto(mod[0]))
})

modsRouter.get('/:id/download', async (c) => {
  const remoteId = c.req.param('id')
  const mod = await db.select().from(mods).where(eq(mods.remoteId, remoteId)).limit(1)
  
  if (mod.length === 0) {
    return c.json({ error: 'Mod not found' }, 404)
  }
  
  const downloads = await db.select()
    .from(modDownloads)
    .where(eq(modDownloads.modId, mod[0].id))
    .orderBy(modDownloads.createdAt)
  
  return c.json(toModDownloadDto(downloads))
})

export default modsRouter
