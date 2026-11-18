/**
 * The offer of a round: what it is, how much of it there is, and the way in.
 *
 * It appears on the Ask line when someone says they want to practise — "quiz me",
 * "let's do the Italian one", or "ok" to Inkling's offer of a round. That is the
 * one moment the model reliably reaches for it; a door volunteered at the end of
 * a joke was tried, and was never once opened.
 *
 * It was a button on its own, and a button on its own under "Ok fine" is a strange
 * thing to be handed: it says "Practise Norse gods" and nothing about what that
 * will be — three cards or three hundred, two minutes or forty. So it is a card
 * now, and it is the same lesson the home screen shows: its cover, its name, how
 * many cards, what is left to review, how far along it is. Then the button.
 *
 * None of that is the model's. The lesson arrives from the server, resolved from
 * the person's own list; the numbers are the ones the home screen worked out and
 * kept (the DASHBOARD cache), so this card cannot say "3 to review" while the
 * screen behind it says five. Nothing is fetched to draw it. If the numbers are
 * not there — a first launch, a lesson made a moment ago — the card still stands
 * on the name and the button; it just says less.
 *
 * With no lesson it is today's round, the one "Start Learning" begins, and says
 * what that amounts to instead.
 */

import { LessonCover } from '@/components/LessonCover';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { loadFromCache } from '@/lib/cache';
import { estimateMinutes } from '@/lib/studyPlan';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, space, type } from '@/theme';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Offer = { lessonId?: string; lessonName?: string };

/** A lesson as the home screen keeps it. Only the fields read here; the rest of
 *  what is cached is that screen's business. */
type Kept = {
  id: string;
  title?: string;
  cards?: number;
  /** What today's plan asks of this lesson. */
  due?: number;
  /** Cards not yet carried all the way — what "to review" counts on the home row. */
  totalDue?: number;
  pct?: number;
  learningMode?: 'language' | 'knowledge';
  coverStyle?: string | null;
};

/** Only what this component can act on. A lesson without a name is not offered as
 *  one: the name is the promise, and a bare id would be a card about nobody knows
 *  what. */
function readOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.lesson_id === 'string' ? value.lesson_id.trim() : '';
  const name = typeof value.lesson_name === 'string' ? value.lesson_name.trim() : '';
  return id && name ? { lessonId: id, lessonName: name } : {};
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const COVER = 48;

export function StartPractice({ raw }: { raw: unknown }) {
  const offer = useMemo(() => readOffer(raw), [raw]);
  const [kept, setKept] = useState<Kept[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      // The stored session, not the network: this is a card in a conversation and
      // must not wait on a round trip to say how many cards a lesson has.
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user.id;
      if (!user) return;
      const lessons = await loadFromCache<Kept[]>('DASHBOARD', user);
      if (live && Array.isArray(lessons)) setKept(lessons);
    })();
    return () => { live = false; };
  }, []);

  if (!offer) return null;

  const lesson = offer.lessonId ? kept?.find((item) => item.id === offer.lessonId) : undefined;
  const today = kept ? kept.reduce((sum, item) => sum + (item.due ?? 0), 0) : null;

  /* What is said under the name. The same phrases the home rows use, so a lesson
   * reads the same here as on the screen behind this one. */
  let facts: string[] = [];
  let empty = false;
  if (offer.lessonId) {
    if (lesson && typeof lesson.cards === 'number') {
      if (lesson.cards === 0) { facts = ['No cards yet']; empty = true; }
      else {
        facts = [plural(lesson.cards, 'card', 'cards')];
        facts.push(lesson.totalDue ? `${lesson.totalDue} to review` : 'All caught up');
      }
    }
  } else if (today !== null) {
    facts = today > 0
      ? [plural(today, 'card', 'cards'), `about ${estimateMinutes(today)} min`]
      : ['Nothing due today'];
    empty = today === 0;
  }

  // The same two routes the rest of the app uses to begin a round; `entry` is what
  // the quiz screen reads to know where it was started from.
  const go = () => router.push((
    offer.lessonId
      ? `/quiz?entry=lesson&lessonId=${encodeURIComponent(offer.lessonId)}`
      : '/quiz?entry=home'
  ) as never);

  const name = offer.lessonName ?? 'Today’s review';
  const pct = offer.lessonId && lesson && typeof lesson.pct === 'number' && !empty
    ? Math.max(0, Math.min(100, lesson.pct)) : null;

  return (
    <Card pad="md" gap={space[3]}>
      <View style={styles.head}>
        {offer.lessonId ? (
          <LessonCover
            id={offer.lessonId} mode={lesson?.learningMode} coverStyle={lesson?.coverStyle}
            width={COVER} height={COVER}
          />
        ) : (
          // Today's round belongs to no one lesson, so it wears the mark the tab
          // bar uses for Today rather than borrowing a cover.
          <View style={styles.today}><Icon name="today" size={24} color={colors.sub} /></View>
        )}
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.name}>{name}</Text>
          {facts.length > 0 && <Text numberOfLines={1} style={styles.facts}>{facts.join('  ·  ')}</Text>}
        </View>
      </View>

      {/* How far along the lesson is: the same bar as its row on the home screen. */}
      {pct !== null && (
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel={`${pct} percent mastered`}
          accessibilityValue={{ min: 0, max: 100, now: pct }}
        >
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
      )}

      <Button
        label="Start practice"
        size="sm"
        width="full"
        // A lesson with no cards, or a day with nothing due, has no round to start.
        // Saying so is this card's job; opening onto an empty quiz is not.
        disabled={empty}
        onPress={go}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  today: {
    width: COVER, height: COVER, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  copy: { flex: 1, gap: space.hair },
  name: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  facts: { ...type.small, fontFamily: fonts.regular, color: colors.sub },
  track: { height: 5, borderRadius: radius.md, backgroundColor: colors.tint, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.sm, backgroundColor: colors.action },
});
