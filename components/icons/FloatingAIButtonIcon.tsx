import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface FloatingAIButtonIconProps {
  size?: number;
}

export default function FloatingAIButtonIcon({ size = 56 }: FloatingAIButtonIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <Path
        d="M0 28C0 12.536 12.536 0 28 0C43.464 0 56 12.536 56 28C56 43.464 43.464 56 28 56C12.536 56 0 43.464 0 28Z"
        fill="#111111"
      />
      <Path
        d="M28 11.5C28.77 11.5 29.4 12.13 29.4 12.9V22.9L43.1 28L29.4 33.1V43.1C29.4 43.87 28.77 44.5 28 44.5C27.23 44.5 26.6 43.87 26.6 43.1V33.1L12.9 28L26.6 22.9V12.9C26.6 12.13 27.23 11.5 28 11.5Z"
        fill="#12B8A3"
      />
      <Path
        d="M28 16.8L31 25L39.2 28L31 31L28 39.2L25 31L16.8 28L25 25L28 16.8Z"
        fill="#18D5BE"
      />
    </Svg>
  );
}

