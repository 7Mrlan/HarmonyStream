/*
 * 组件：DotMatrixBackground
 * 作用：屏幕底层的 8px 间距点阵网格，提升暗色背景的质感与赛博氛围
 * 实现：SVG <pattern> 一次绘制，无运行时开销；点直径 1px / 颜色 line token
 */

import { StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';

export interface DotMatrixBackgroundProps {
  /* 点阵颜色，默认使用 token line（#1f1f1f） */
  color?: string;
  /* 点之间的间距，默认 8px，需配合像素 4 倍数原则 */
  spacing?: number;
  /* 点的半径，默认 0.5px（视觉上极淡） */
  radius?: number;
}

export function DotMatrixBackground({
  color = '#1f1f1f',
  spacing = 8,
  radius = 0.5,
}: DotMatrixBackgroundProps) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        {/* 单元格内画一个点，由 SVG 自动平铺整屏 */}
        <Pattern id="dots" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={radius} cy={radius} r={radius} fill={color} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}
