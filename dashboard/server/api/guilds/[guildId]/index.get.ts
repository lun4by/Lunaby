import { getGuildDashboard } from '../../../utils/luna-dashboard'

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, 'guildId')

  if (!guildId) {
    throw createError({ statusCode: 400, statusMessage: 'guildId is required' })
  }

  return await getGuildDashboard(guildId)
})
