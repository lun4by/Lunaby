import { css } from '@emotion/css'

const glassPanel = css`
  background: #ffffff;
`

const heroPanel = css`
  background: #fff7f3;
`

const metricCard = css`
  background: #ffffff;
`

export function useEmotionClasses() {
  return {
    glassPanel,
    heroPanel,
    metricCard,
  }
}
