/**
 * Making a lesson by talking it through.
 *
 * The sibling of /create, not a replacement for it. That screen turns a line of
 * text into cards. This one teaches: ask it what a thing is and it explains, and
 * then the explanation can become cards — which is the part someone actually came
 * for. It also looks at what you already have, so the cards join a lesson that
 * fits instead of making a near-duplicate.
 *
 * Nothing here writes to a lesson. The answer ends in drafted cards, and the person
 * ticks what they keep (components/chat/CardDrafts).
 *
 * It comes up from the bottom and closes with a cross, like /create and the quiz:
 * this is something you step into and leave, not a page further down a path.
 */

import { CardDrafts } from '@/components/chat/CardDrafts';
import { LessonTarget } from '@/components/chat/LessonTarget';
import { ChatShell } from '@/components/chat/ChatShell';
import { EdBase } from '@/components/EdBase';
import { ChatTopBar } from '@/components/chat/ChatTopBar';
import { clearConversation } from '@/lib/chatClient';
import { dialog } from '@/lib/dialog';
import { safeBack } from '@/lib/safeBack';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

/* Three ways in, each exercising something this line can really do: one that ends
 * in drafted cards, one that is purely an explanation, and one that looks at the
 * lessons already there (they arrive with every message, so it needs no tool at
 * all). Nothing here asks for something this line cannot do, which is the only
 * rule these have to follow. */
const STARTERS = [
  'Teach me 10 phrases for ordering food',
  'Explain how spaced repetition works',
  'What am I already learning?',
];

export default function CreateChatScreen() {
  // Carried when this is opened from a lesson, so the answer can be about that one.
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>();
  const [started, setStarted] = useState(false);
  /* Clearing is a remount, not a reset. The thread the server is keeping has to
   * go with the conversation on screen, or the next question would arrive as a
   * reply to one nobody can see any more; changing the key drops both at once. */
  const [round, setRound] = useState(0);
  /* The conversation is kept until it is cleared, so clearing removes it from
   * where it is kept before the screen lets go of it. If that fails the screen
   * stays as it is: emptying it anyway would bring the same conversation back
   * the next time this opened. */
  const clear = async () => {
    if (!(await clearConversation('create'))) {
      return dialog('Could not clear it', 'The conversation is still here. Try again in a moment.');
    }
    setRound((n) => n + 1);
  };

  return (
    <EdBase scroll={false} bottomInset={0}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatTopBar title="Learn something" onClose={() => safeBack('/(tabs)')}
        started={started} onClear={() => void clear()} />
      <ChatShell
        key={round}
        // Just cleared: there is nothing to bring back, so do not go looking.
        fresh={round > 0}
        onStarted={setStarted}
        mode="create"
        context={lessonId ? { lesson_id: lessonId } : undefined}
        opening="What do you want to learn? Ask me about it and I’ll explain — then we can turn it into cards if it is worth keeping."
        placeholder="What do you want to learn?"
        starters={STARTERS}
        /* Two interfaces, in the order they are needed: the drafts, and then —
           as its own turn, once the person has said to keep them — where they go.
           `show_lesson_target` is not a model tool: the app raises it itself when
           the button is pressed (ChatShell's `useSay`), so deciding where cards
           land costs no model call. */
        renderComponent={({ name, props }) => {
          if (name === 'show_card_drafts') return <CardDrafts raw={props} />;
          if (name === 'show_lesson_target') return <LessonTarget raw={props} />;
          return null;
        }}
      />
    </EdBase>
  );
}

