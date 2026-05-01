import { clearCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import React, { useEffect, useRef, useState } from 'react';
import { colors } from '@/theme';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const options = {
  headerShown: false,
};

export default function LessonSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [lessonName, setLessonName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [isVocabMode, setIsVocabMode] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedExploreId, setPublishedExploreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const switchAnim = useRef(new Animated.Value(0)).current;

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // 日期选择器动画
  useEffect(() => {
    if (showDatePicker) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [showDatePicker, slideAnim]);

  // 开关动画
  useEffect(() => {
    Animated.spring(switchAnim, {
      toValue: isVocabMode ? 1 : 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [isVocabMode, switchAnim]);

  // 获取课程信息
  useEffect(() => {
    const fetchLesson = async () => {
      if (!id) {
        setError('Lesson ID is required');
        setLoading(false);
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('User not authenticated');
          setLoading(false);
          return;
        }

        const { data: lessonData, error: lessonError } = await supabase
          .from('lessons')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (lessonError) {
          console.error('Error fetching lesson:', lessonError);
          setError('Failed to load lesson');
          setLoading(false);
          return;
        }

        if (!lessonData) {
          setError('Lesson not found');
          setLoading(false);
          return;
        }

        // 填充表单
        setLessonName(lessonData.name || '');
        setDescription(lessonData.description || '');
        setIsVocabMode(lessonData.is_vocab_mode || false);
        if (lessonData.deadline) {
          setDeadline(new Date(lessonData.deadline));
        }

        const { data: publishedLesson } = await supabase
          .from('explore_lessons')
          .select('id')
          .eq('source_lesson_id', id)
          .maybeSingle();
        setPublishedExploreId(publishedLesson?.id ?? null);
      } catch (err) {
        console.error('Error:', err);
        setError('Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchLesson();
  }, [id]);

  // 保存更改
  const handleSave = async () => {
    if (!id) return;

    // 验证必填字段
    if (!lessonName.trim()) {
      setError('Lesson Name is required');
      Alert.alert('Error', 'Please enter a lesson name');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        setSaving(false);
        return;
      }

      const updateData: any = {
        name: lessonName.trim(),
      };

      if (description.trim()) {
        updateData.description = description.trim();
      } else {
        updateData.description = null;
      }

      if (deadline) {
        updateData.deadline = deadline.toISOString();
      } else {
        updateData.deadline = null;
      }

      updateData.is_vocab_mode = isVocabMode;

      const { error: updateError } = await supabase
        .from('lessons')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating lesson:', updateError);
        Alert.alert('Error', updateError.message || 'Failed to update lesson');
        setSaving(false);
        return;
      }

      // 清除本地缓存（名称/deadline 变了，列表和详情都需要刷新）
      void clearCache('LESSON_DETAIL', id as string);
      void clearCache('DASHBOARD', user.id);
      void clearCache('LESSONS', user.id);

      // 成功：返回详情页
      Alert.alert('Success', 'Lesson updated successfully', [
        {
          text: 'OK',
          onPress: () => safeBack('/(tabs)/library'),
        },
      ]);
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
      setSaving(false);
    }
  };

  // 删除课程
  const handleDelete = () => {
    Alert.alert(
      'Delete Lesson',
      'Are you sure? This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;

            setDeleting(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Error', 'User not authenticated');
                setDeleting(false);
                return;
              }

              const { error: deleteError } = await supabase
                .from('lessons')
                .delete()
                .eq('id', id)
                .eq('user_id', user.id);

              if (deleteError) {
                console.error('Error deleting lesson:', deleteError);
                Alert.alert('Error', deleteError.message || 'Failed to delete lesson');
                setDeleting(false);
                return;
              }

              // 清除本地缓存
              void clearCache('LESSON_DETAIL', id as string);
              void clearCache('DASHBOARD', user.id);
              void clearCache('LESSONS', user.id);

              // 成功：跳转到课程列表页
              Alert.alert('Success', 'Lesson deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => {
                    const nav = router as any;
                    if (typeof nav.dismissTo === 'function') {
                      nav.dismissTo('/(tabs)/library');
                      return;
                    }
                    router.replace('/(tabs)/library' as any);
                  },
                },
              ]);
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'Something went wrong');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const normalizeSlug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

  const handlePublish = () => {
    Alert.alert(
      'Publish to Explore',
      publishedExploreId
        ? 'Republish this lesson to update Explore content?'
        : 'Publish this lesson so other users can add it from Explore?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: publishedExploreId ? 'Republish' : 'Publish',
          onPress: async () => {
            if (!id) return;
            setPublishing(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Error', 'User not authenticated');
                return;
              }

              const { data: ownedLesson, error: lessonError } = await supabase
                .from('lessons')
                .select('id, name, description, is_vocab_mode')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();
              if (lessonError || !ownedLesson) {
                Alert.alert('Error', lessonError?.message || 'Lesson not found');
                return;
              }

              const { data: sourceTerms, error: sourceTermsError } = await supabase
                .from('terms')
                .select('id, term, definition, explanation')
                .eq('lesson_id', id)
                .order('created_at', { ascending: true });
              if (sourceTermsError || !sourceTerms) {
                Alert.alert('Error', sourceTermsError?.message || 'Failed to load terms');
                return;
              }
              if (sourceTerms.length === 0) {
                Alert.alert('Error', 'Please add terms before publishing.');
                return;
              }

              const sourceTermIds = sourceTerms.map((t) => t.id);
              const { data: sourceQuestions } = await supabase
                .from('questions')
                .select('id, term_id, question_text, question_type, options, correct_answer, explanation')
                .in('term_id', sourceTermIds);

              const fallbackExploreId = `u-${user.id.slice(0, 8)}-${normalizeSlug(ownedLesson.name) || id.slice(0, 8)}`;
              const exploreId = publishedExploreId || fallbackExploreId;
              const rawCreatorName =
                (user.user_metadata?.full_name as string | undefined)?.trim() ||
                user.email?.split('@')[0] ||
                'creator';
              const creatorHandle = rawCreatorName.startsWith('@')
                ? rawCreatorName
                : `@${rawCreatorName}`;

              const { error: upsertLessonError } = await supabase
                .from('explore_lessons')
                .upsert({
                  id: exploreId,
                  title: ownedLesson.name,
                  description: ownedLesson.description || '',
                  category: ownedLesson.is_vocab_mode ? 'lang' : 'tech',
                  creator_handle: creatorHandle,
                  is_official: false,
                  is_new: true,
                  is_featured: false,
                  cards_count: sourceTerms.length,
                  learners_count: 0,
                  sort_order: 999,
                  source_lesson_id: id,
                  published_by: user.id,
                })
                .select('id')
                .single();
              if (upsertLessonError) {
                Alert.alert('Error', upsertLessonError.message || 'Failed to publish lesson');
                return;
              }

              await supabase.from('explore_questions').delete().eq('lesson_id', exploreId);
              await supabase.from('explore_terms').delete().eq('lesson_id', exploreId);

              const { data: insertedTerms, error: insertTermsError } = await supabase
                .from('explore_terms')
                .insert(
                  sourceTerms.map((term, index) => ({
                    lesson_id: exploreId,
                    source_term_id: term.id,
                    term: term.term,
                    definition: term.definition,
                    explanation: term.explanation || '',
                    sort_order: index + 1,
                  }))
                )
                .select('id, source_term_id');
              if (insertTermsError || !insertedTerms) {
                Alert.alert('Error', insertTermsError?.message || 'Failed to publish terms');
                return;
              }

              const exploreTermBySourceId = new Map(insertedTerms.map((t) => [t.source_term_id, t.id]));
              const questionPayload = (sourceQuestions || [])
                .map((question, index) => {
                  const exploreTermId = exploreTermBySourceId.get(question.term_id);
                  if (!exploreTermId) return null;
                  return {
                    lesson_id: exploreId,
                    source_question_id: question.id,
                    explore_term_id: exploreTermId,
                    question_text: question.question_text,
                    question_type: question.question_type,
                    options: question.options,
                    correct_answer: question.correct_answer,
                    explanation: question.explanation,
                    sort_order: index + 1,
                  };
                })
                .filter(Boolean);

              if (questionPayload.length > 0) {
                const { error: insertQuestionsError } = await supabase
                  .from('explore_questions')
                  .insert(questionPayload as any);
                if (insertQuestionsError) {
                  Alert.alert('Error', insertQuestionsError.message || 'Failed to publish questions');
                  return;
                }
              }

              setPublishedExploreId(exploreId);
              Alert.alert('Success', publishedExploreId ? 'Lesson republished.' : 'Lesson published to Explore.');
            } catch (err) {
              console.error('Publish error:', err);
              Alert.alert('Error', 'Failed to publish lesson');
            } finally {
              setPublishing(false);
            }
          },
        },
      ]
    );
  };

  // 格式化日期
  const formatDate = (date: Date | null) => {
    if (!date) return null;
    try {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading lesson...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !lessonName) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={colors.red} />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => safeBack('/(tabs)/library')}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.topbar}>
          <TouchableOpacity
            onPress={() => safeBack('/(tabs)/library')}
            style={styles.topbarSideBtn}
            activeOpacity={0.7}
            disabled={saving || deleting || publishing}
          >
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Lesson</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={styles.topbarSideBtn}
            activeOpacity={0.7}
            disabled={saving || deleting || publishing}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.tag, (deleting || publishing) && styles.tagDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 错误提示 */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* 表单区域 */}
          <View style={styles.formCard}>
            {/* Lesson Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Lesson Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.singleLineInput]}
                placeholder="Enter lesson name"
                placeholderTextColor={colors.muted}
                value={lessonName}
                onChangeText={(text) => {
                  setLessonName(text);
                  setError(null);
                }}
                editable={!saving && !deleting}
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="Enter description (optional)"
                placeholderTextColor={colors.muted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!saving && !deleting}
              />
            </View>

            {/* Vocabulary Mode */}
            <View style={styles.inputGroup}>
              <View style={styles.switchContainer}>
                <View style={styles.switchLabelContainer}>
                  <Text style={styles.label}>Vocabulary Mode</Text>
                  <Text style={styles.switchDescription}>
                    For words and phrases only. Not for grammar.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.switch,
                    isVocabMode && styles.switchActive,
                    (saving || deleting) && styles.switchDisabled,
                  ]}
                  onPress={() => !saving && !deleting && setIsVocabMode(!isVocabMode)}
                  disabled={saving || deleting}
                  activeOpacity={0.7}
                >
                  <Animated.View
                    style={[
                      styles.switchThumb,
                      {
                        transform: [
                          {
                            translateX: switchAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, 20],
                            }),
                          },
                        ],
                        backgroundColor: switchAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['#FFFFFF', '#FFFFFF'],
                        }),
                      },
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Deadline */}
            <View style={[styles.inputGroup, styles.inputGroupLast]}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, styles.labelInRow]}>Deadline</Text>
                {deadline && (
                  <TouchableOpacity
                    onPress={() => setDeadline(null)}
                    style={styles.clearButton}
                    disabled={saving || deleting}
                  >
                    <Text style={styles.clearButtonText}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[styles.input, styles.singleLineInput, styles.dateInputButton]}
                onPress={() => !saving && !deleting && setShowDatePicker(true)}
                disabled={saving || deleting}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.datePickerText,
                    !deadline && styles.datePickerPlaceholder,
                  ]}
                >
                  {deadline
                    ? formatDate(deadline)
                    : 'Select deadline (optional)'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Delete Lesson 按钮 */}
          <TouchableOpacity
            style={[styles.publishButton, (saving || deleting || publishing) && styles.saveButtonDisabled]}
            onPress={handlePublish}
            disabled={saving || deleting || publishing}
            activeOpacity={0.8}
          >
            {publishing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <>
                <Feather name="upload-cloud" size={20} color={colors.accent} />
                <Text style={styles.publishButtonText}>
                  {publishedExploreId ? 'Republish to Explore' : 'Publish to Explore'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Delete Lesson 按钮 */}
          <TouchableOpacity
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={saving || deleting}
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.red} />
            ) : (
              <>
                <Feather name="trash-2" size={20} color={colors.red} />
                <Text style={styles.deleteButtonText}>Delete Lesson</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 日期选择器 */}
      {showDatePicker && (
        <>
          {Platform.OS === 'ios' ? (
            <Modal
              visible={showDatePicker}
              transparent
              animationType="none"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowDatePicker(false)}
              >
                <Animated.View
                  style={[
                    styles.modalContent,
                    {
                      transform: [{ translateY: slideAnim }],
                    },
                  ]}
                >
                  <View style={styles.modalHeader}>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={styles.modalButton}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Select Deadline</Text>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={styles.modalButton}
                    >
                      <Text style={styles.modalDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.datePickerContainer}>
                    <DateTimePicker
                      value={deadline || new Date()}
                      mode="date"
                      display="spinner"
                      onChange={(event, selectedDate) => {
                        if (selectedDate) {
                          setDeadline(selectedDate);
                        }
                      }}
                      minimumDate={new Date()}
                      textColor="#111827"
                      themeVariant="light"
                    />
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </Modal>
          ) : (
            <DateTimePicker
              value={deadline || new Date()}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  setDeadline(selectedDate);
                }
              }}
              minimumDate={new Date()}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  topbar: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  topbarSideBtn: {
    minWidth: 64,
    zIndex: 2,
  },
  cancel: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  title: {
    fontSize: 16,
    lineHeight: 22.4,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: 'JetBrainsMono_800',
    fontWeight: '400',
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  tag: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    textAlign: 'right',
  },
  tagDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_700',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    textAlign: 'center',
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 28,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'JetBrainsMono_500',
  },
  formCard: {
    backgroundColor: colors.surf,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputGroupLast: {
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_600',
    marginBottom: 8,
  },
  labelInRow: {
    marginBottom: 0,
  },
  required: {
    color: colors.red,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
    borderWidth: 1,
    borderColor: colors.border,
  },
  textarea: {
    minHeight: 100,
    paddingTop: 14,
  },
  singleLineInput: {
    minHeight: 52,
    lineHeight: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  dateInputButton: {
    justifyContent: 'center',
  },
  datePickerText: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
  },
  datePickerPlaceholder: {
    color: colors.muted,
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 12,
    color: colors.red,
    lineHeight: 17,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_600',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  publishButton: {
    backgroundColor: colors.surf,
    borderRadius: 8,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  publishButtonText: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    marginLeft: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surf,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalTitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  modalCancelText: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_500',
  },
  modalDoneText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  datePickerContainer: {
    backgroundColor: colors.surf,
    paddingVertical: 10,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 16,
  },
  switchDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    marginTop: 4,
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.dim,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchActive: {
    backgroundColor: colors.accent,
  },
  switchDisabled: {
    opacity: 0.5,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
});

