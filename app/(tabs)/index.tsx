import AIChatModal from '@/components/AIChatModal';
import { EdBase } from '@/components/EdBase';
import { Icon } from '@/components/Icon';
import { SectionLabel } from '@/components/SectionLabel';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface LessonSummary {
  id: string;
  title: string;
  sub: string;
  cards: number;
  due: number;
  pct: number;
}

/**
 * Today / Home — daily-focus surface.
 *
 * Editorial vocabulary:
 *  - Big numeric in the hero ("19" cards due) — type before chrome.
 *  - 32% goal bar — hairline, 2px tall.
 *  - "Up Next" queue rendered as standalone cards (not divider list).
 *  - Empty CTA at the bottom uses a dashed border to feel quiet.
 */
export default function TodayScreen() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [username, setUsername] = useState('User');
  const [showAIChat, setShowAIChat] = useState(false);
  const visibleLessons = lessons.slice(0, 5);
  const lessonsCount = lessons.length;

  useEffect(() => {
    const loadUserName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fromMeta = user.user_metadata?.full_name as string | undefined;
      const fromEmail = user.email?.split('@')[0];
      setUsername((fromMeta?.trim() || fromEmail || 'User').trim());
    };
    loadUserName();
  }, []);

  const fetchLessons = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLessons([]);
      return;
    }

    const { data: lessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, name, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (lessonsError || !lessonsData) {
      setLessons([]);
      return;
    }

    const lessonIds = lessonsData.map((l) => l.id);
    if (lessonIds.length === 0) {
      setLessons([]);
      return;
    }

    const { data: termsData } = await supabase
      .from('terms')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds);

    const termIds = termsData?.map((t) => t.id) || [];
    const { data: progressData } = termIds.length
      ? await supabase
          .from('user_term_progress')
          .select('term_id, status')
          .eq('user_id', user.id)
          .in('term_id', termIds)
      : { data: [] as { term_id: string; status: string | null }[] };

    const progressMap = new Map<string, string | null>();
    (progressData || []).forEach((p) => {
      progressMap.set(p.term_id, p.status);
    });

    const termsByLesson = new Map<string, { id: string; lesson_id: string }[]>();
    (termsData || []).forEach((term) => {
      if (!termsByLesson.has(term.lesson_id)) {
        termsByLesson.set(term.lesson_id, []);
      }
      termsByLesson.get(term.lesson_id)?.push(term);
    });

    const nextLessons: LessonSummary[] = lessonsData.map((lesson) => {
      const lessonTerms = termsByLesson.get(lesson.id) || [];
      const cards = lessonTerms.length;
      let completed = 0;

      lessonTerms.forEach((term) => {
        const status = progressMap.get(term.id);
        if (status === 'Strong' || status === 'Mastered') {
          completed += 1;
        }
      });

      const pct = cards > 0 ? Math.round((completed / cards) * 100) : 0;
      const due = Math.max(cards - completed, 0);

      return {
        id: lesson.id,
        title: lesson.name || 'Untitled lesson',
        sub: lesson.description || 'No description',
        cards,
        due,
        pct,
      };
    });

    setLessons(nextLessons);
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  useFocusEffect(
    useCallback(() => {
      fetchLessons();
    }, [fetchLessons])
  );

  return (
    <View style={styles.screen}>
      <EdBase>
        {/* Header */}
        <View style={[styles.row, styles.headerRow]}>
        <View style={{ flex: 1 }}>
          <SectionLabel size={11}>Tuesday · April 29</SectionLabel>
          <Text style={styles.greet}>Good morning, {username}</Text>
        </View>
        <View style={styles.streakBlock}>
          <Text style={styles.streakNum}>47</Text>
          <SectionLabel size={10} style={{ marginTop: 4 }}>Day Streak</SectionLabel>
        </View>
      </View>

      {/* Hero — focus queue */}
      <View style={styles.hero}>
        <SectionLabel size={12} style={{ marginBottom: 8, fontFamily: 'JetBrainsMono_500', fontWeight: '400' }}>Focus Queue</SectionLabel>
        <View style={styles.heroLine}>
          <Text style={styles.heroNum}>19</Text>
          <Text style={[styles.heroSub, styles.heroSubMain]}>cards due today</Text>
          <Text style={[styles.heroSub, styles.heroSubRight]}>~12 min</Text>
        </View>

        {/* Goal bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: '32%' }]} />
        </View>
        <View style={styles.barRow}>
          <Text style={[styles.barLabel, styles.barLabelLeft]}>6 of 19 reviewed</Text>
          <Text style={[styles.barLabel, styles.barLabelRight]}>Daily goal: 19</Text>
        </View>

        <Button onPress={() => router.push('/quiz')} style={styles.cta}>
          <Text style={styles.ctaText}>Start review →</Text>
        </Button>
      </View>

      {/* All lessons — card stream */}
      <View style={styles.section}>
        <View style={[styles.sectionHead, styles.row]}>
          <SectionLabel size={11}>All lessons</SectionLabel>
          <Button style={styles.lessonsLink} onPress={() => router.push('/(tabs)/library')}>
            <Text style={styles.sectionMeta}>{lessonsCount} lessons</Text>
            <Icon name="chevronRight" color={colors.muted} size={12} />
          </Button>
        </View>
        <View style={{ gap: 8 }}>
          {visibleLessons.map((d) => (
            <Button key={d.id} onPress={() => router.push(`/lessons/${d.id}`)} style={styles.queueCard}>
              <View style={styles.lessonTitleRow}>
                <Text style={styles.lessonTitle} numberOfLines={1}>{d.title}</Text>
                <Text style={[styles.dueLabel, { color: d.due > 0 ? colors.accent : colors.muted }]}>
                  {d.due > 0 ? `${d.due} due` : 'caught up'}
                </Text>
              </View>
              <Text style={styles.lessonSub}>{d.sub}</Text>
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${d.pct}%` }]} />
                </View>
                <Text style={styles.cardsLabel}>{d.cards} cards</Text>
                <Text style={styles.pctLabel}>{d.pct}%</Text>
              </View>
            </Button>
          ))}
        </View>
      </View>

        {/* Empty CTA: 仅当 lessons 少于 5 个时显示 */}
        {lessonsCount < 5 && (
          <View style={{ padding: 16, paddingTop: 16, paddingBottom: 24 }}>
            <Button onPress={() => router.push('/create')} style={styles.makeNew}>
              <View>
                <Text style={styles.makeNewTitle}>Make a new lesson</Text>
                <Text style={styles.makeNewSub}>Generate cards from a question or doc</Text>
              </View>
              <Text style={styles.makeNewPlus}>+</Text>
            </Button>
          </View>
        )}
      </EdBase>
      <TouchableOpacity
        style={styles.aiFloatingBtn}
        onPress={() => setShowAIChat(true)}
        activeOpacity={0.85}
      >
        <Feather name="message-circle" size={20} color="#FFFFFF" />
        <Text style={styles.aiFloatingText}>AI</Text>
      </TouchableOpacity>
      <AIChatModal visible={showAIChat} onClose={() => setShowAIChat(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  headerRow: {
    paddingHorizontal: 18, paddingTop: 20, paddingBottom: 14,
    alignItems: 'flex-start', gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  greet: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 18, fontWeight: '400', letterSpacing: -0.3, marginTop: 2, color: colors.text,
  },
  streakBlock: { alignItems: 'flex-end' },
  streakNum: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 24, fontWeight: '400', letterSpacing: -0.4, color: colors.accent, lineHeight: 30,
  },

  hero: {
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  heroLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroNum: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 52, fontWeight: '400', letterSpacing: -1.5, color: colors.text, lineHeight: 62,
    paddingTop: 2,
  },
  heroSub: { fontFamily: 'JetBrainsMono_400', fontSize: 14, fontWeight: '400', color: colors.muted },
  heroSubMain: { marginLeft: 4, flexShrink: 1 },
  heroSubRight: { marginLeft: 'auto', flexShrink: 0, textAlign: 'right' },

  barTrack: { height: 2, borderRadius: 1, backgroundColor: colors.dim, marginTop: 14, overflow: 'hidden' },
  barFill:  { height: '100%', backgroundColor: colors.accent },
  barRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, gap: 8 },
  barLabel: { fontSize: 12, lineHeight: 17, color: colors.muted, fontFamily: 'JetBrainsMono_500' },
  barLabelLeft: { flexShrink: 1 },
  barLabelRight: { flexShrink: 0, textAlign: 'right' },

  cta: {
    marginTop: 16, paddingVertical: 15, borderRadius: 8,
    backgroundColor: colors.accent, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '400', fontFamily: 'JetBrainsMono_700' },

  section: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 4 },
  sectionHead: { paddingHorizontal: 4, paddingBottom: 10, alignItems: 'center' },
  sectionMeta: { fontSize: 12, color: colors.muted, fontFamily: 'JetBrainsMono_500' },
  lessonsLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  queueCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    position: 'relative',
  },
  lessonTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  lessonTitle: {
    flex: 1,
    fontFamily: 'JetBrainsMono_700',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: -0.1,
    color: colors.text,
  },
  dueLabel: { fontSize: 12, fontWeight: '400', fontFamily: 'JetBrainsMono_600', textAlign: 'right', flexShrink: 0 },
  lessonSub:  {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    color: colors.muted,
    marginTop: 3,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  progressTrack: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.dim, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  cardsLabel: { fontSize: 11, color: colors.muted, width: 60, textAlign: 'right', fontFamily: fonts.grotesk },
  pctLabel: { fontSize: 11, color: colors.text, fontWeight: '700', width: 34, textAlign: 'right', fontFamily: fonts.grotesk },

  makeNew: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dim, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  makeNewTitle: { fontSize: 13, fontWeight: '400', color: colors.text, fontFamily: 'JetBrainsMono_600' },
  makeNewSub:   { fontSize: 11, color: colors.muted, marginTop: 2, fontFamily: 'JetBrainsMono_400' },
  makeNewPlus:  { fontSize: 20, color: colors.muted, fontFamily: 'JetBrainsMono_400' },
  aiFloatingBtn: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: '#16715D',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 6,
  },
  aiFloatingText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
});
