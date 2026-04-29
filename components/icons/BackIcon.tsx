import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface BackIconProps {
  size?: number;
  color?: string;
}

export default function BackIcon({ size = 20, color = '#0A0A0A' }: BackIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10.0001 15.8333L4.16675 9.99996L10.0001 4.16663"
        stroke={color}
        strokeWidth="1.66613"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.8334 10H4.16675"
        stroke={color}
        strokeWidth="1.66613"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

