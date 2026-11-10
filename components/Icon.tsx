import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

export type IconName =
  | 'circlePlus'
  | 'arrowRight'
  | 'home'
  | 'library'
  | 'profile'
  | 'plus'
  | 'check'
  | 'close'
  | 'chevronRight'
  | 'chevronLeft';

interface IconProps {
  name: IconName;
  color: string;
  size?: number;
  /** Stroke width — defaults to 1.6 for tab icons, override to 3 for affirmative check/close. */
  strokeWidth?: number;
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
}

/**
 * Hand-rolled stroke icon set. Zero icon-library dependencies.
 * All icons share a 24x24 viewBox so the rendered size is consistent.
 */
export function Icon({ name, color, size = 20, strokeWidth = 1.6, strokeLinejoin = 'round' }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
  };
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin,
    fill: 'none' as const,
  };

  switch (name) {
    case 'circlePlus':
      return <Svg {...common}><G {...stroke}><Circle cx={12} cy={12} r={9} /><Path d="M8 12h8M12 8v8" /></G></Svg>;
    case 'arrowRight':
      return <Svg {...common}><Path d="M5 12h14M13 6l6 6-6 6" {...stroke} /></Svg>;
    case 'home':
      return (
        <Svg {...common}>
          <Path d="M4 11l8-7 8 7v9H4z" {...stroke} />
        </Svg>
      );
    case 'library':
      return (
        <Svg {...common}>
          <G {...stroke}>
            <Rect x={5} y={4} width={14} height={16} rx={1.5} />
            <Path d="M9 4v16" />
          </G>
        </Svg>
      );
    case 'profile':
      return (
        <Svg {...common}>
          <G {...stroke}>
            <Circle cx={12} cy={9} r={3.5} />
            <Path d="M5 20c1.4-3.6 4-5 7-5s5.6 1.4 7 5" />
          </G>
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...common}>
          <Path d="M12 5v14M5 12h14" {...stroke} strokeWidth={strokeWidth || 2.4} />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...common}>
          <Path d="M5 12.5l4.5 4.5L19 7" {...stroke} strokeWidth={strokeWidth || 3} />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...common}>
          <Path d="M6 6l12 12M18 6l-12 12" {...stroke} strokeWidth={strokeWidth || 3} />
        </Svg>
      );
    case 'chevronRight':
      return (
        <Svg {...common}>
          <Path d="M9 6l6 6-6 6" {...stroke} />
        </Svg>
      );
    case 'chevronLeft':
      return (
        <Svg {...common}>
          <Path d="M15 6l-6 6 6 6" {...stroke} />
        </Svg>
      );
  }
}
