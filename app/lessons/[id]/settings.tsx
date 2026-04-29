import BackIcon from '@/components/icons/BackIcon';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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

      // 成功：返回详情页
      Alert.alert('Success', 'Lesson updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
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

              // 成功：跳转到课程列表页
              Alert.alert('Success', 'Lesson deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => router.replace('/lessons' as any),
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
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading lesson...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !lessonName) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
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
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButtonHeader}
              activeOpacity={0.7}
            >
              <BackIcon size={20} color="#0A0A0A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Lesson Settings</Text>
            <View style={styles.headerRight} />
          </View>

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
                style={styles.input}
                placeholder="Enter lesson name"
                placeholderTextColor="#9CA3AF"
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
                placeholderTextColor="#9CA3AF"
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
                    Optimizes questions for language learning (pronunciation, synonyms, antonyms, sentences).
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
            <View style={styles.inputGroup}>
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
                style={styles.input}
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

          {/* Save Changes 按钮 */}
          <TouchableOpacity
            style={[styles.saveButton, (saving || deleting) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || deleting}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
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
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Feather name="trash-2" size={20} color="#EF4444" />
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
    backgroundColor: '#F9FAFB',
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButtonHeader: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(120,116,150,0.08)',
    borderRadius: 16.4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  headerRight: {
    width: 40,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 14,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  labelInRow: {
    marginBottom: 0,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textarea: {
    minHeight: 100,
    paddingTop: 14,
  },
  datePickerText: {
    fontSize: 16,
    color: '#111827',
  },
  datePickerPlaceholder: {
    color: '#9CA3AF',
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalDoneText: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '600',
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
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
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 20,
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  switchActive: {
    backgroundColor: '#4E49FC',
  },
  switchDisabled: {
    opacity: 0.5,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});

