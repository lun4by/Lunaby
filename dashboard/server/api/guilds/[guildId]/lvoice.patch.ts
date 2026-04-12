import { z } from 'zod'
import { saveLVoiceConfig } from '../../../utils/luna-dashboard'

const bodySchema = z.object({
  creatorChannelId: z.string().trim().nullable(),
  categoryId: z.string().trim().nullable(),
  defaultName: z.string().trim().min(1).max(100),
  defaultLimit: z.coerce.number().int().min(0).max(99),
  defaultBitrate: z.coerce.number().int().min(8000).max(384000),
})

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, 'guildId')
  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: 'guildId is required' })
  }

  const body = bodySchema.parse(await readBody(event))
  await saveLVoiceConfig(guildId, body)
  return { ok: true }
})
