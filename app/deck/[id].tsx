import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { clearCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface ExploreLessonDetail {
  id: string;
  title: string;
  description: string;
}

interface ExploreTermDetail {
  id: string;
  term: string;
  definition: string;
  explanation: string;
  sort_order: number;
}

interface ExploreQuestionDetail {
  id: string;
  explore_term_id: string;
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'fill_blank';
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  sort_order: number;
}

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<ExploreLessonDetail | null>(null);
  const [terms, setTerms] = useState<ExploreTermDetail[]>([]);
  const [questions, setQuestions] = useState<ExploreQuestionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [existingLessonId, setExistingLessonId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const loadExploreDetail = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: lessonData, error: lessonError } = await supabase
        .from('explore_lessons')
        .select('id, title, description')
        .eq('id', id)
        .single();

      if (lessonError || !lessonData) {
        setDetail(null);
        setTerms([]);
        setLoading(false);
        return;
      }

      const { data: termsData } = await supabase
        .from('explore_terms')
        .select('id, term, definition, explanation, sort_order')
        .eq('lesson_id', lessonData.id)
        .order('sort_order', { ascending: true });

      const { data: questionsData } = await supabase
        .from('explore_questions')
        .select('id, explore_term_id, question_text, question_type, options, correct_answer, explanation, sort_order')
        .eq('lesson_id', lessonData.id)
        .order('sort_order', { ascending: true });

      setDetail({
        id: lessonData.id,
        title: lessonData.title,
        description: lessonData.description || '',
      });
      setTerms(termsData || []);
      setQuestions((questionsData || []) as ExploreQuestionDetail[]);
      setLoading(false);
    };
    loadExploreDetail();
  }, [id]);

  useEffect(() => {
    const checkExistingLesson = async () => {
      if (!detail?.title) {
        setExistingLessonId(null);
        return;
      }
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;
      const { data: lesson } = await supabase
        .from('lessons')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', detail.title)
        .maybeSingle();
      setExistingLessonId(lesson?.id ?? null);
    };
    checkExistingLesson();
  }, [detail?.title]);

  const cardCount = terms.length;

  const handleAddLesson = async () => {
    try {
      setAdding(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        Alert.alert('Error', 'Please log in first.');
        return;
      }

      if (existingLessonId) {
        router.push(`/lessons/${existingLessonId}` as never);
        return;
      }
      if (!detail) return;

      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user.id,
          name: detail.title,
          description: detail.description,
          deadline: null,
        })
        .select('id')
        .single();

      if (lessonError || !lesson) {
        Alert.alert('Error', lessonError?.message || 'Failed to add lesson.');
        return;
      }

      const { data: insertedTerms, error: termsError } = await supabase
        .from('terms')
        .insert(
          terms.map((t) => ({
            lesson_id: lesson.id,
            term: t.term,
            definition: t.definition,
            explanation: t.explanation,
          }))
        )
        .select('id, term, definition');

      if (termsError) {
        Alert.alert('Error', termsError.message || 'Failed to add lesson terms.');
        return;
      }

      // 直接复制 explore 预置题目，不再实时调用 LLM
      if (insertedTerms && insertedTerms.length > 0 && questions.length > 0) {
        const sourceTermById = new Map(terms.map((t) => [t.id, t.term]));
        const insertedTermIdByTerm = new Map(insertedTerms.map((t) => [t.term, t.id]));

        const questionPayload = questions
          .map((q) => {
            const sourceTerm = sourceTermById.get(q.explore_term_id);
            if (!sourceTerm) return null;
            const targetTermId = insertedTermIdByTerm.get(sourceTerm);
            if (!targetTermId) return null;
            return {
              term_id: targetTermId,
              question_text: q.question_text,
              question_type: q.question_type,
              options: q.options,
              correct_answer: q.correct_answer,
              explanation: q.explanation,
            };
          })
          .filter(Boolean);

        if (questionPayload.length > 0) {
          await supabase.from('questions').insert(
            questionPayload as Array<{
              term_id: string;
              question_text: string;
              question_type: 'mcq' | 'true_false' | 'fill_blank';
              options: string[] | null;
              correct_answer: string;
              explanation: string | null;
            }>
          );
        }
      }

      // 新课程已添加到用户库，清除列表缓存
      void clearCache('DASHBOARD', user.id);
      void clearCache('LESSONS', user.id);

      setExistingLessonId(lesson.id);
      router.push(`/lessons/${lesson.id}` as never);
    } finally {
      setAdding(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/explore');
  };

  if (loading) {
    return (
      <EdBase>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      </EdBase>
    );
  }

  if (!detail) {
    return (
      <EdBase>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ color: colors.muted, fontFamily: 'JetBrainsMono_400', textAlign: 'center' }}>
            Lesson not found.
          </Text>
        </View>
      </EdBase>
    );
  }

  return (
    <EdBase scroll={false} bottomInset={0}>
      <View style={styles.nav}>
        <Pressable onPress={handleBack}>
          <Text style={styles.navBack}>← Explore</Text>
        </Pressable>
        <Pressable onPress={handleAddLesson} disabled={adding}>
          <Text style={styles.navEdit}>{existingLessonId ? 'Added' : adding ? 'Adding...' : 'Add'}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <SectionLabel style={{ marginBottom: 8 }}>Lesson</SectionLabel>
          <Text style={styles.title}>{detail.title}</Text>
          <Text style={styles.sub}>{detail.description} · {cardCount} cards</Text>
        </View>

        <View style={styles.ctaWrap}>
          <Pressable onPress={handleAddLesson} style={styles.cta} disabled={adding}>
            {adding ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {existingLessonId ? 'Added to My Lessons ✓' : 'Add to My Lessons →'}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
            <SectionLabel>Terms</SectionLabel>
          </View>
          <View style={{ gap: 8 }}>
            {terms.map((t, index) => (
              <View key={`${t.id}-${index}`} style={styles.cardRow}>
                <Text style={styles.cardNum}>{String(index + 1).padStart(2, '0')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardQ}>{t.term}</Text>
                  <Text style={styles.cardDef}>{t.definition}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  nav: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBack: { fontSize: 13, color: colors.muted, fontFamily: 'JetBrainsMono_400', fontWeight: '400' },
  navEdit: {
    fontSize: 13,
    letterSpacing: -0.1,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
  contentScroll: {
    flex: 1,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: colors.surf,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontFamily: 'JetBrainsMono_700',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '400',
    letterSpacing: -0.7,
    color: colors.text,
  },
  sub: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 6,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surf,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cta: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '400', fontFamily: 'JetBrainsMono_700' },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  cardRow: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardNum: {
    fontSize: 10.5,
    lineHeight: 15,
    color: colors.muted,
    fontWeight: '400',
    width: 22,
    fontFamily: 'JetBrainsMono_600',
  },
  cardQ: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    marginBottom: 3,
    letterSpacing: -0.1,
  },
  cardDef: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.sub,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
    letterSpacing: -0.1,
  },
});
