/**
 * Asking about what you are practising.
 *
 * The other line to /create-chat, and deliberately a different thing: this one
 * never makes cards. It explains — what a card means, why the answer you gave was
 * not the one expected — and offers to start a round when you are ready.
 *
 * The two are kept apart because the allowance is charged before the model runs,
 * so the line has to be known at the door rather than guessed from the message
 * (spec §12.1).
 *
 * Comes up from the bottom and closes with a cross: stepped into and left, not a
 * page further down a path.
 */

import { ChatShell } from '@/components/chat/ChatShell';
import { EdBase } from '@/components/EdBase';
import { ChatTopBar } from '@/components/chat/ChatTopBar';
import { StartPractice } from '@/components/chat/StartPractice';
import { clearConversation } from '@/lib/chatClient';
import { dialog } from '@/lib/dialog';
import { safeBack } from '@/lib/safeBack';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

/* What is worth offering depends on whether a card came with the entry.
 *
 * Each of these is something the line can actually do. It can explain, it can
 * read a lesson before answering about it, and it can put up the button for a
 * round — so one of the general ones is a way into practice, which is the thing
 * this line ends in. It still cannot say how the week went or count what is due
 * (no progress tools yet, spec §16.2(d)), so nothing here asks for that. */
const ABOUT_THIS = [
  'Explain this again, simply',
  'Why was my answer wrong?',
  'Give me a way to remember this',
];
const IN_GENERAL = [
  'Quiz me on what is due today',
  'Why do I forget things soon after learning them?',
  'How do I remember vocabulary better?',
];

export default function PracticeChatScreen() {
  // Set when this is opened from a lesson or from a question that was missed.
  const { lessonId, cardId } = useLocalSearchParams<{ lessonId?: string; cardId?: string }>();
  const [started, setStarted] = useState(false);
  /* Clearing is a remount: the thread the server is keeping has to go with the
   * conversation on screen, or the next question would arrive as a reply to one
   * nobody can see any more. */
  const [round, setRound] = useState(0);
  /* The conversation is kept until it is cleared, so clearing removes it from
   * where it is kept before the screen lets go of it. If that fails the screen
   * stays as it is: emptying it anyway would bring the same conversation back
   * the next time this opened. */
  const clear = async () => {
    if (!(await clearConversation('practice'))) {
      return dialog('Could not clear it', 'The conversation is still here. Try again in a moment.');
    }
    setRound((n) => n + 1);
  };

  return (
    <EdBase scroll={false} bottomInset={0}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatTopBar title="Ask a question" onClose={() => safeBack('/(tabs)')}
        started={started} onClear={() => void clear()} />
      <ChatShell
        key={round}
        // Just cleared: there is nothing to bring back, so do not go looking.
        fresh={round > 0}
        onStarted={setStarted}
        mode="practice"
        context={lessonId || cardId ? { lesson_id: lessonId, card_id: cardId } : undefined}
        opening="Ask about anything you are learning — what a card means, or why an answer was not the one expected."
        placeholder="Ask about a card"
        starters={lessonId || cardId ? ABOUT_THIS : IN_GENERAL}
        /* The one interface this line draws: the button for a round, which the
         * model puts up when someone says they want one. */
        renderComponent={({ name, props }) => {
          if (name === 'start_practice') return <StartPractice raw={props} />;
          return null;
        }}
      />
    </EdBase>
  );
}

