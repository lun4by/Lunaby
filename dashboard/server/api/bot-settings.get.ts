import { getBotSettings } from '../utils/luna-dashboard'

export default defineEventHandler(async () => {
  return {
    items: await getBotSettings(),
  }
})
