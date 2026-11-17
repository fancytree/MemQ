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
import { ChatShell } from '@/components/chat/ChatShell';
import { EdBase } from '@/components/EdBase';
import { CloseButton } from '@/components/ui/RoundButtons';
import { safeBack } from '@/lib/safeBack';
import { layout, space } from '@/theme';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function CreateChatScreen() {
  // Carried when this is opened from a lesson, so the answer can be about that one.
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>();

  return (
    <EdBase scroll={false} bottomInset={0}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topbar}>
        <CloseButton onPress={() => safeBack('/(tabs)')} label="Close" />
      </View>
      <ChatShell
        mode="create"
        context={lessonId ? { lesson_id: lessonId } : undefined}
        opening="What do you want to learn? Ask me about it and I’ll explain — then we can turn it into cards if it is worth keeping."
        placeholder="Ask about anything you want to learn"
        renderComponent={({ name, props }) =>
          (name === 'show_card_drafts' ? <CardDrafts raw={props} /> : null)}
      />
    </EdBase>
  );
}

const styles = StyleSheet.create({
  topbar: {
    paddingHorizontal: layout.screenInline,
    paddingTop: space[3],
    paddingBottom: space[3],
    flexDirection: 'row',
    alignItems: 'center',
  },
});
