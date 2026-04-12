import { z } from 'zod'
import { saveBotSetting } from '../utils/luna-dashboard'

const bodySchema = z.object({
  key: z.string().min(1).max(50),
  value: z.string().max(255),
  updatedBy: z.string().max(32).default('dashboard'),
})

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  await saveBotSetting(body.key, body.value, body.updatedBy)
  return { ok: true }
})
