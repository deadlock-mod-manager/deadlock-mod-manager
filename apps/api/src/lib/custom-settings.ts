import { prisma } from '@deadlock-mods/database'
import { toCustomSettingDto } from '@deadlock-mods/utils'
import { Hono } from 'hono'

const customSettings = new Hono()

customSettings.get('/', async (c) => {
  const customSettings = await prisma.customSetting.findMany()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return c.json(customSettings.map(toCustomSettingDto))
})

export default customSettings
