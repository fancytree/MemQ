/**
 * The way to cards that costs nothing: the person's own AI writes them.
 *
 * This was a line of small text under the box, and nobody found it — including
 * the person who asked for it. It is one of three ways to make cards on this
 * page, and the only one with no limit, so it is drawn as what it is: a card you
 * press, the same weight as the switch above the box, saying in four words what
 * it is and in four more why you would.
 *
 * It carries along whatever has been typed into the box, so "the French
 * Revolution" does not have to be typed again on the other side.
 */

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { colors, fonts, radius, space, type } from '@/theme';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export function OwnAiEntry({ lessonId, topic }: {
  /** Set when the cards are for a lesson that exists. */
  lessonId?: string;
  /** What has been typed so far, if anything. */
  topic?: string;
}) {
  const go = () => {
    const params: Record<string, string> = {};
    if (lessonId) params.lessonId = lessonId;
    if (topic?.trim()) params.topic = topic.trim().slice(0, 2000);
    router.push({ pathname: '/import-cards', params } as never);
  };
  return (
    <Card onPress={go} pad="sm" gap={space[3]} faceStyle={styles.face}
      accessibilityLabel="Use your own AI to make the cards. Free, with no limit.">
      <View style={styles.icon}><Icon name="copy" size={19} color={colors.sub} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>Use your own AI</Text>
        <Text numberOfLines={1} style={styles.hint}>ChatGPT, Claude and others. Free, no limit.</Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.sub} />
    </Card>
  );
}

const styles = StyleSheet.create({
  // The same row as the learning-mode switch, so the two read as one family.
  face: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  icon: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.limeSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  copy: { flex: 1, gap: space.hair },
  title: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  hint: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
});
