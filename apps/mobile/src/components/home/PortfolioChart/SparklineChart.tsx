import { area, curveCardinal, line } from 'd3-shape'
import { memo, useEffect, useId, useMemo } from 'react'
import Animated, { useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Defs, Path, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg'

type ChartPoint = { timestamp: number; value: number }
export type ChartData = ChartPoint[]

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const CURVE = curveCardinal.tension(0.9)
const STROKE_WIDTH = 1.5
const DOT_RADIUS = 5
const PULSE_MAX_RADIUS = 12
const PULSE_DURATION_MS = 2000

interface SparklineChartProps {
  data: ChartData
  width: number
  height: number
  color: string
  yGutter?: number
  showDot?: boolean
  dotStrokeColor?: string
}

export const SparklineChart = memo(function SparklineChart({
  data,
  width,
  height,
  color,
  yGutter = 0,
  showDot = false,
  dotStrokeColor,
}: SparklineChartProps): JSX.Element | null {
  const gradientId = `sparkline-gradient-${useId()}`
  // When showing the dot, reserve right padding so the pulse circle isn't clipped
  const rightPadding = showDot ? PULSE_MAX_RADIUS : 0
  const dataWidth = width - rightPadding

  const { linePath, areaPath, lastPoint } = useMemo(() => {
    if (data.length < 2) {
      return { linePath: null, areaPath: null, lastPoint: null }
    }

    const first = data[0]
    if (!first) {
      return { linePath: null, areaPath: null, lastPoint: null }
    }
    let minT = first.timestamp
    let maxT = minT
    let minV = first.value
    let maxV = minV
    for (let i = 1; i < data.length; i++) {
      const point = data[i]
      if (!point) {
        continue
      }
      const { timestamp, value } = point
      if (timestamp < minT) {
        minT = timestamp
      }
      if (timestamp > maxT) {
        maxT = timestamp
      }
      if (value < minV) {
        minV = value
      }
      if (value > maxV) {
        maxV = value
      }
    }

    const rangeT = maxT - minT || 1
    const rangeV = maxV - minV || 1

    const scaleX = (t: number): number => ((t - minT) / rangeT) * dataWidth
    const scaleY = (v: number): number => yGutter + ((maxV - v) / rangeV) * (height - yGutter * 2)

    const lineGenerator = line<ChartPoint>()
      .x((d) => scaleX(d.timestamp))
      .y((d) => scaleY(d.value))
      .curve(CURVE)

    const areaGenerator = area<ChartPoint>()
      .x((d) => scaleX(d.timestamp))
      .y0(height)
      .y1((d) => scaleY(d.value))
      .curve(CURVE)

    const last = data[data.length - 1]

    return {
      linePath: lineGenerator(data),
      areaPath: areaGenerator(data),
      lastPoint: last ? { x: scaleX(last.timestamp), y: scaleY(last.value) } : null,
    }
  }, [data, dataWidth, height, yGutter])

  if (!linePath || !areaPath) {
    return null
  }

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.4} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradientId})`} />
      <Path d={linePath} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
      {showDot && lastPoint && (
        <>
          <PulseDot cx={lastPoint.x} cy={lastPoint.y} color={color} />
          <Circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={DOT_RADIUS}
            fill={color}
            stroke={dotStrokeColor}
            strokeWidth={dotStrokeColor ? 2 : 0}
          />
        </>
      )}
    </Svg>
  )
})

const PulseDot = memo(function PulseDot({ cx, cy, color }: { cx: number; cy: number; color: string }): JSX.Element {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: PULSE_DURATION_MS }), -1, false)
  }, [])

  const animatedProps = useAnimatedProps(() => ({
    r: DOT_RADIUS + progress.value * (PULSE_MAX_RADIUS - DOT_RADIUS),
    opacity: 0.4 * (1 - progress.value),
  }))

  return <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={animatedProps} />
})
