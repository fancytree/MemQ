import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface HistoryIconProps {
  size?: number;
  color?: string;
}

export default function HistoryIcon({ size = 20, color = '#0A0A0A' }: HistoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 14V24H34M24 42C14.0589 42 6 33.9411 6 24C6 14.0589 14.0589 6 24 6C33.9411 6 42 14.0589 42 24C42 33.9411 33.9411 42 24 42Z"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

