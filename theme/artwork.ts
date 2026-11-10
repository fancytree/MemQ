import { sourceReference } from './components';

const base = `https://www.figma.com/design/${sourceReference.fileKey}/Untitled`;
const localExports: Record<string, string> = {
  '33:1424': 'assets/design-system/inkling-curious.svg',
  '33:1412': 'assets/design-system/inkling-thinking.svg',
  '33:1446': 'assets/design-system/inkling-happy.svg',
  '33:1525': 'assets/design-system/inkling-sleepy.svg',
};
const asset = (name: string, nodeId: string, use: string) => ({
  name, nodeId, use, url: `${base}?node-id=${nodeId.replace(':', '-')}`,
  availability: localExports[nodeId] ? 'local-export' as const : 'figma-source-only' as const,
  localPath: localExports[nodeId] ?? null,
});
/** Approved sources, not invented replacement SVGs. Four poses are exported locally; remaining registry entries retain explicit source-only status. */
export const artwork = {
  decorations: [
    asset('Pinned little note', '33:1271', 'Brief reminder'),
    asset('Clipped ruled page', '33:1282', 'Saving or collecting an idea'),
    asset('Torn peach reminder', '33:1290', 'Supportive aside'),
    asset('First little stamp', '33:1297', 'Small milestone'),
    asset('Looping down arrow', '33:1308', 'Nearby next step'),
    asset('Follow this arrow', '33:1313', 'Directional margin detail'),
    asset('Two little hearts', '33:1318', 'Warm encouragement; not semantic feedback'),
    asset('Streak flame', '33:1325', 'Continuous-learning streak; never a star'),
    asset('Washi tape pieces', '33:1334', 'Occasional paper attachment'),
    asset('Lilac paperclip', '33:1342', 'Collecting notes'),
    asset('Flower and leaf', '33:1348', 'Supportive detail'),
    asset('Paper plane and trail', '33:1357', 'Creation/completion'),
    asset('Handwritten nudge', '33:1367', 'Short encouragement'),
    asset('Soft marker underline', '33:1373', 'One short annotation'),
    asset('Open little book', '33:1380', 'Learning/library'),
    asset('Blue page bookmark', '33:1388', 'Saved material'),
  ],
  inkling: [
    asset('Hello', '33:1401', 'Daily welcome'),
    asset('Thinking', '33:1412', 'Working through an idea'),
    asset('Curious', '33:1424', 'Discover something new'),
    asset('Focused', '33:1436', 'One card at a time'),
    asset('Happy', '33:1446', 'A good little moment'),
    asset('Well done', '33:1456', 'Review complete'),
    asset('You can do it', '33:1467', 'Gentle encouragement'),
    asset('Little celebration', '33:1479', 'Goal reached'),
    asset('Not quite sure', '33:1491', 'A question to explore'),
    asset('Try again', '33:1503', 'Another chance, no pressure'),
    asset('Taking a breath', '33:1515', 'Pause and reset'),
    asset('Sleepy', '33:1525', 'All caught up'),
  ],
} as const;
