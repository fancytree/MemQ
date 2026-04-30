export interface DueCard {
  id: string;
  topic: string;
  card: string;
  count: number;
}

export const dueToday: DueCard[] = [
  { id: 'd1', topic: 'World History', card: 'The Treaty of Westphalia (1648)', count: 4 },
  { id: 'd2', topic: 'Spanish · A2', card: '"Quedar" vs "Quedarse"', count: 7 },
  { id: 'd3', topic: 'Microeconomics', card: 'Cross-price elasticity', count: 3 },
  { id: 'd4', topic: 'Cell Biology', card: 'Krebs cycle — net ATP yield', count: 5 },
];

export type DeckId = 'hist' | 'span' | 'econ' | 'bio' | 'mgmt';

export interface DeckSummary {
  id: DeckId;
  title: string;
  cards: number;
  due: number;
  pct: number;
  sub: string;
}

export const deckSummaries: DeckSummary[] = [
  { id: 'hist', title: 'World History · 1500–1900', cards: 84, due: 7, pct: 62, sub: 'Treaties, revolutions, colonization' },
  { id: 'span', title: 'Spanish · A2', cards: 142, due: 11, pct: 48, sub: 'Verbs, prepositions, idioms' },
  { id: 'econ', title: 'Microeconomics 101', cards: 56, due: 3, pct: 79, sub: 'Supply, demand, elasticity' },
  { id: 'bio', title: 'Cell Biology', cards: 73, due: 5, pct: 88, sub: 'Organelles, cycles, genetics' },
  { id: 'mgmt', title: 'Operations Management', cards: 41, due: 0, pct: 94, sub: 'Lean, queues, capacity' },
];

export type CardStatus = 'due' | 'learning' | 'mastered';

export interface CardRow {
  n: string;
  q: string;
  status: CardStatus;
}

export interface DeckDetail {
  id: DeckId;
  title: string;
  sub: string;
  cards: number;
  due: number;
  mastered: number;
  pct: number;
  list: CardRow[];
}

export const deckDetail: Record<DeckId, DeckDetail> = {
  hist: {
    id: 'hist',
    title: 'World History · 1500–1900',
    sub: 'Treaties, revolutions, colonization',
    cards: 84, due: 7, mastered: 52, pct: 62,
    list: [
      { n: '01', q: 'The Treaty of Westphalia (1648)', status: 'due' },
      { n: '02', q: 'Causes of the French Revolution', status: 'mastered' },
      { n: '03', q: 'Meiji Restoration — key reforms', status: 'learning' },
      { n: '04', q: 'Berlin Conference outcomes', status: 'due' },
      { n: '05', q: 'The Concert of Europe', status: 'mastered' },
    ],
  },
  span: {
    id: 'span',
    title: 'Spanish · A2',
    sub: 'Verbs, prepositions, idioms',
    cards: 142, due: 11, mastered: 68, pct: 48,
    list: [
      { n: '01', q: '"Quedar" vs "Quedarse"', status: 'due' },
      { n: '02', q: 'Por vs Para — usage table', status: 'learning' },
      { n: '03', q: 'Subjunctive triggers (WEIRDO)', status: 'due' },
      { n: '04', q: '"Echar de menos" — translation', status: 'mastered' },
      { n: '05', q: 'Reflexive change-of-state verbs', status: 'learning' },
    ],
  },
  econ: {
    id: 'econ',
    title: 'Microeconomics 101',
    sub: 'Supply, demand, elasticity',
    cards: 56, due: 3, mastered: 44, pct: 79,
    list: [
      { n: '01', q: 'Cross-price elasticity', status: 'due' },
      { n: '02', q: 'Marginal rate of substitution', status: 'mastered' },
      { n: '03', q: 'Giffen goods — definition', status: 'learning' },
      { n: '04', q: 'Producer surplus on a graph', status: 'mastered' },
    ],
  },
  bio: {
    id: 'bio',
    title: 'Cell Biology',
    sub: 'Organelles, cycles, genetics',
    cards: 73, due: 5, mastered: 64, pct: 88,
    list: [
      { n: '01', q: 'Krebs cycle — net ATP yield', status: 'due' },
      { n: '02', q: 'Mitochondrial DNA inheritance', status: 'mastered' },
      { n: '03', q: 'Phases of mitosis', status: 'mastered' },
      { n: '04', q: 'Golgi apparatus function', status: 'learning' },
    ],
  },
  mgmt: {
    id: 'mgmt',
    title: 'Operations Management',
    sub: 'Lean, queues, capacity',
    cards: 41, due: 0, mastered: 38, pct: 94,
    list: [
      { n: '01', q: "Little's Law — formula", status: 'mastered' },
      { n: '02', q: 'Bottleneck identification steps', status: 'mastered' },
      { n: '03', q: 'Kanban — 6 core practices', status: 'mastered' },
    ],
  },
};
