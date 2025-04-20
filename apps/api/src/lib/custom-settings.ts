import { customSettings, db } from '@deadlock-mods/database'
import { toCustomSettingDto } from '@deadlock-mods/utils'
import { Hono } from 'hono'

const customSettingsRouter = new Hono()

customSettingsRouter.get('/', async (c) => {
  const settings = await db.select().from(customSettings)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return c.json(settings.map(toCustomSettingDto))
})

export default customSettingsRouter
