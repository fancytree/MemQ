export type QuestionMode = 'mcq' | 'recall' | 'flip';

interface QuestionBase {
  topic: string;
  q: string;
  explain?: string;
}

export interface MCQ extends QuestionBase {
  mode: 'mcq';
  opts: string[];
  correct: number;
}

export interface RecallQuestion extends QuestionBase {
  mode: 'recall';
  answer: string;
}

export interface FlipQuestion extends QuestionBase {
  mode: 'flip';
  back: string;
}

export type Question = MCQ | RecallQuestion | FlipQuestion;

export const questions: Question[] = [
  {
    mode: 'mcq',
    topic: 'World History',
    q: 'What was the Treaty of Westphalia (1648) most known for establishing?',
    opts: [
      'The principle of state sovereignty in international relations',
      'The abolition of the Holy Roman Empire entirely',
      'A unified European currency system',
      'The Catholic Church\u2019s authority over secular states',
    ],
    correct: 0,
    explain:
      'Westphalia ended the Thirty Years\u2019 War and codified the principle that states have authority over their own territory — the bedrock of the modern state system.',
  },
  {
    mode: 'recall',
    topic: 'Spanish · A2',
    q: 'Translate to English: "Echar de menos"',
    answer: 'to miss',
    explain:
      '"Echar de menos" means to miss someone or something. Latin American Spanish often uses "extrañar" instead.',
  },
  {
    mode: 'flip',
    topic: 'Microeconomics',
    q: 'Cross-price elasticity of demand',
    back:
      'Measures how the quantity demanded of one good changes in response to a price change of another. Positive → substitutes; negative → complements.',
  },
  {
    mode: 'mcq',
    topic: 'Cell Biology',
    q: 'What is the net ATP yield per glucose molecule from the Krebs cycle alone?',
    opts: ['2 ATP', '4 ATP', '6 ATP', '36 ATP'],
    correct: 0,
    explain:
      'The Krebs cycle directly produces 2 ATP (or GTP) per glucose. Most ATP comes later from the electron transport chain.',
  },
];
