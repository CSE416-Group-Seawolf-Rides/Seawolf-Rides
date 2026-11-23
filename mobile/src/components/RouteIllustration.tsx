import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { colors, radii } from '../theme';

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

const LABEL_CHAR_WIDTH = 7;
const LABEL_HEIGHT = 24;

function RouteLabel({ at, text }: { at: Point; text: string }) {
  const width = text.length * LABEL_CHAR_WIDTH + 20;

  return (
    <G>
      <Rect
        fill={colors.surface}
        height={LABEL_HEIGHT}
        rx={LABEL_HEIGHT / 2}
        stroke={colors.border}
        width={width}
        x={at.x - width / 2}
        y={at.y - LABEL_HEIGHT / 2}
      />
      <SvgText
        fill={colors.text}
        fontSize={12}
        fontWeight="700"
        textAnchor="middle"
        x={at.x}
        y={at.y + 4}
      >
        {text}
      </SvgText>
    </G>
  );
}

// A stylized map: the driver's commute picks up a rider on the way to campus.
// Drawn in the container's own coordinate space so it fills any screen height.
function RouteMap({ width: w, height: h }: Size) {
  const origin = { x: w * 0.17, y: h * 0.74 };
  const pickup = { x: w * 0.5, y: h * 0.5 };
  const campus = { x: w * 0.83, y: h * 0.27 };
  const bend = w * 0.17;

  const route = [
    `M ${origin.x} ${origin.y}`,
    `C ${origin.x + bend} ${origin.y}, ${pickup.x - bend} ${pickup.y}, ${pickup.x} ${pickup.y}`,
    `S ${campus.x - bend} ${campus.y}, ${campus.x} ${campus.y}`,
  ].join(' ');

  const roads = [
    `M 0 ${h * 0.62} C ${w * 0.3} ${h * 0.55}, ${w * 0.6} ${h * 0.94}, ${w} ${h * 0.8}`,
    `M 0 ${h * 0.28} C ${w * 0.35} ${h * 0.16}, ${w * 0.62} ${h * 0.4}, ${w} ${h * 0.33}`,
    `M ${w * 0.3} 0 C ${w * 0.37} ${h * 0.35}, ${w * 0.22} ${h * 0.7}, ${w * 0.33} ${h}`,
    `M ${w * 0.74} 0 C ${w * 0.67} ${h * 0.4}, ${w * 0.8} ${h * 0.7}, ${w * 0.7} ${h}`,
  ];

  return (
    <Svg height={h} width={w}>
      {roads.map((road, index) => (
        <Path
          d={road}
          fill="none"
          // A fixed list, so the position is a stable key; the path text is not unique
          // when the size is tiny.
          key={index}
          stroke={colors.surfaceMuted}
          strokeLinecap="round"
          strokeWidth={12}
        />
      ))}

      <Path
        d={route}
        fill="none"
        stroke={colors.accent}
        strokeLinecap="round"
        strokeWidth={4}
      />

      <Circle cx={origin.x} cy={origin.y} fill={colors.surface} r={7} stroke={colors.accent} strokeWidth={3} />
      <Circle cx={pickup.x} cy={pickup.y} fill={colors.surface} r={6} stroke={colors.text} strokeWidth={3} />
      <Circle cx={campus.x} cy={campus.y} fill={colors.accentSoft} r={16} />
      <Circle cx={campus.x} cy={campus.y} fill={colors.accent} r={7} />

      <RouteLabel at={{ x: origin.x, y: origin.y + 30 }} text="Driver" />
      <RouteLabel at={{ x: pickup.x, y: pickup.y - 28 }} text="Rider" />
      <RouteLabel at={{ x: campus.x, y: campus.y + 34 }} text="Stony Brook" />
    </Svg>
  );
}

export function RouteIllustration() {
  const [size, setSize] = useState<Size | null>(null);

  function measure({ nativeEvent }: LayoutChangeEvent) {
    const { width, height } = nativeEvent.layout;
    setSize((current) =>
      current?.width === width && current.height === height ? current : { width, height },
    );
  }

  // The map is measured and drawn in an absolutely positioned layer so its size never
  // feeds back into the frame's layout (which would make the frame grow on every pass).
  return (
    <View
      accessibilityLabel="Map of a driver picking up a rider on the way to Stony Brook"
      accessibilityRole="image"
      style={styles.frame}
    >
      <View onLayout={measure} style={StyleSheet.absoluteFill}>
        {/* The web can report 0×0 before layout settles; there is nothing to draw yet. */}
        {size && size.width > 0 && size.height > 0 && (
          <RouteMap height={size.height} width={size.width} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    minHeight: 190,
    overflow: 'hidden',
  },
});
