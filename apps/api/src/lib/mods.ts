import { prisma } from '@deadlock-mods/database'
import { toModDownloadDto, toModDto } from '@deadlock-mods/utils'
import { Hono } from 'hono'

const mods = new Hono()

mods.get('/', async (c) => {
  const mods = await prisma.mod.findMany()
  return c.json(mods.map(toModDto))
})

mods.get('/:id/download', async (c) => {
  const mod = await prisma.mod.findUnique({
    where: { remoteId: c.req.param('id') },
    include: {
      downloads: {
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  })

  if (!mod) {
    return c.json({ error: 'Mod not found' }, 404)
  }

  return c.json(toModDownloadDto(mod.downloads))
})

export default mods
