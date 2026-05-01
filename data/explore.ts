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

export interface ExploreLesson {
  id: string;
  title: string;
  cards: number;
  creator: string;
  isOfficial?: boolean;
  cat: Exclude<ExploreCategoryId, 'all'>;
  isNew: boolean;
  learners: number;
  description: string;
  isFeatured: boolean;
  sortOrder: number;
}
