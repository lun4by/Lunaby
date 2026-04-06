import { getUserPersonalization } from '../../utils/luna-dashboard'

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'userId')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }

  return await getUserPersonalization(userId)
})
