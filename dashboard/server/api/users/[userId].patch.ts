import { z } from 'zod'
import { saveUserPersonalization } from '../../utils/luna-dashboard'

const bodySchema = z.object({
  occupation: z.string().trim().max(100).nullable(),
  customInstructions: z.string().trim().max(500).nullable(),
  allowSearchHistoryReference: z.boolean(),
  allowMemoryStorage: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  const body = bodySchema.parse(await readBody(event))
  await saveUserPersonalization(userId, body)
  return { ok: true }
})
