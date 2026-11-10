import { FittedDesignAsset } from './DesignAsset';

export type BuddyMood = 'curious' | 'thinking' | 'happy' | 'sleepy';
interface MemqBuddyProps {
  size?: number;
  mood?: BuddyMood;
  /** @deprecated Authored Inkling SVG palettes are preserved; custom recoloring is unsupported. */
  color?: string;
}

/** Compatibility slot: replace artwork while keeping every caller's original width and height. */
export function MemqBuddy({ size = 104, mood = 'curious' }: MemqBuddyProps) {
  return <FittedDesignAsset name={mood} width={size} height={size * 1.12} />;
}
