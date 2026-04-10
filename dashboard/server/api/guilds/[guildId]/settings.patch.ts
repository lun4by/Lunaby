import { z } from 'zod'
import { saveGuildSettings } from '../../../utils/luna-dashboard'

const bodySchema = z.object({
  settings: z.object({
    prefix: z.string().trim().max(10).nullable(),
    language: z.string().trim().max(10),
    xp: z.object({
      isActive: z.boolean(),
      exceptions: z.array(z.string().trim().min(1)).max(100),
    }),
    greeter: z.object({
      welcome: z.object({
        isEnabled: z.boolean(),
        channel: z.string().trim().nullable(),
        message: z.string().trim().nullable(),
      }),
      leaving: z.object({
        isEnabled: z.boolean(),
        channel: z.string().trim().nullable(),
        message: z.string().trim().nullable(),
      }),
    }),
    voiceToggle: z.object({
      isEnabled: z.boolean(),
    }),
    roles: z.object({
      muted: z.string().trim().nullable(),
    }),
    channels: z.object({
      suggest: z.string().trim().nullable(),
      voteLog: z.string().trim().nullable(),
    }),
    settings: z.object({
      levelUpNotifications: z.boolean(),
      levelUpChannel: z.string().trim().nullable(),
      useEmbeds: z.boolean(),
    }),
  }),
  modSettings: z.object({
    logChannelId: z.string().trim().nullable(),
    modActionLogs: z.boolean(),
    monitorLogs: z.boolean(),
  }),
})

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, 'guildId')
  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: 'guildId is required' })
  }

  const body = bodySchema.parse(await readBody(event))
  await saveGuildSettings(guildId, body)
  return { ok: true }
})
