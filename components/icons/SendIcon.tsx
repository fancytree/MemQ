import React from 'react';
import Svg, { Rect, Path } from 'react-native-svg';

interface SendIconProps {
  size?: number;
  opacity?: number;
}

export default function SendIcon({ size = 32, opacity = 1 }: SendIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" opacity={opacity}>
      <Rect width="32" height="32" rx="8" fill="#4E49FC" />
      <Path
        d="M10.75 16L16 10.75L21.25 16"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 21.25V10.75"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

