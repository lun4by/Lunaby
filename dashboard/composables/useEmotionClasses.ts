import { css } from '@emotion/css'

const glassPanel = css`
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 245, 0.75)),
    radial-gradient(circle at top right, rgba(255, 197, 158, 0.25), transparent 30%);
  box-shadow: 0 22px 70px rgba(17, 17, 17, 0.08);
  backdrop-filter: blur(18px);
`

const heroPanel = css`
  background:
    linear-gradient(140deg, rgba(255, 255, 255, 0.98), rgba(255, 214, 222, 0.44)),
    radial-gradient(circle at top left, rgba(255, 95, 125, 0.16), transparent 32%),
    radial-gradient(circle at bottom right, rgba(196, 243, 221, 0.4), transparent 34%);
  box-shadow: 0 28px 80px rgba(17, 17, 17, 0.08);
`

const metricCard = css`
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(213, 240, 255, 0.55));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 20px 48px rgba(17, 17, 17, 0.06);
`

export function useEmotionClasses() {
  return {
    glassPanel,
    heroPanel,
    metricCard,
  }
}
