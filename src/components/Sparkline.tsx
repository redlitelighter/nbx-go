import React, { useMemo } from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface SparklineProps {
  data: number[];
  width: number;
  height: number;
  color: string;
  /** Fill a soft gradient under the line. */
  fill?: boolean;
  strokeWidth?: number;
}

/** Tiny price line, downsampled to ~40 points so long series stay cheap. */
export function Sparkline({ data, width, height, color, fill = true, strokeWidth = 1.6 }: SparklineProps) {
  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' };
    const step = Math.max(1, Math.floor(data.length / 40));
    const pts = data.filter((_, i) => i % step === 0 || i === data.length - 1);
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const pad = strokeWidth;
    const xy = pts.map((v, i) => [
      (i / (pts.length - 1)) * width,
      pad + (1 - (v - min) / span) * (height - pad * 2),
    ]);
    const l = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return { line: l, area: `${l} L${width},${height} L0,${height} Z` };
  }, [data, width, height, strokeWidth]);

  if (!line) return null;
  const id = `spark-${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <Svg width={width} height={height}>
      {fill ? (
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.28} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
      ) : null}
      {fill ? <Path d={area} fill={`url(#${id})`} /> : null}
      <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
