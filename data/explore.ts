export type ExploreCategoryId = 'all' | 'lang' | 'sci' | 'hist' | 'tech' | 'arts';

export interface ExploreCategory {
  id: ExploreCategoryId;
  label: string;
}

export const exploreCategories: ExploreCategory[] = [
  { id: 'all',  label: 'All' },
  { id: 'lang', label: 'Languages' },
  { id: 'sci',  label: 'Science' },
  { id: 'hist', label: 'History' },
  { id: 'tech', label: 'Tech' },
  { id: 'arts', label: 'Arts' },
];

export interface FeaturedDeck {
  id: string;
  title: string;
  sub: string;
  author: string;
  learners: string;
  edition: string;
}

export const featuredDeck: FeaturedDeck = {
  id: 'feat-stoic',
  title: 'Stoic Philosophy',
  sub: 'Marcus Aurelius, Epictetus, Seneca · 64 cards',
  author: 'Curated by MemQ',
  learners: '12.4k',
  edition: '№ 04',
};

export interface TrendingDeck {
  id: string;
  title: string;
  sub: string;
  cat: Exclude<ExploreCategoryId, 'all'>;
  isNew: boolean;
  learners: string;
}

export const trendingDecks: TrendingDeck[] = [
  { id: 't1', title: 'Japanese · N5 Kanji',     sub: '103 cards · @hiro',        cat: 'lang', isNew: true,  learners: '8.2k' },
  { id: 't2', title: 'Organic Chemistry I',     sub: 'Functional groups · @melb',cat: 'sci',  isNew: false, learners: '5.6k' },
  { id: 't3', title: 'Roman Emperors',          sub: '49 emperors · @classics',  cat: 'hist', isNew: false, learners: '3.1k' },
  { id: 't4', title: 'Big-O Complexity',        sub: 'Algorithms · @csprep',     cat: 'tech', isNew: true,  learners: '9.8k' },
  { id: 't5', title: 'Renaissance Painters',    sub: '32 cards · @atlas',        cat: 'arts', isNew: false, learners: '2.4k' },
  { id: 't6', title: 'French · A1 Verbs',       sub: '58 conjugations · @lou',   cat: 'lang', isNew: false, learners: '6.0k' },
];
