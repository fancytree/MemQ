import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
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
import DateTimePicker from '@react-native-community/datetimepicker';

export default function CreateLesson() {
  const [lessonName, setLessonName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [isVocabMode, setIsVocabMode] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(300)).current; // 初始位置在屏幕下方
  const switchAnim = useRef(new Animated.Value(0)).current;

  // 当 showDatePicker 改变时，触发动画
  useEffect(() => {
    if (showDatePicker) {
      // 立即显示 overlay，内容从底部滑入
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      // 重置动画值
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

  // 创建 Lesson
  const handleCreateLesson = async () => {
    // 验证必填字段
    if (!lessonName.trim()) {
      setError('Lesson Name is required');
      Alert.alert('Error', 'Please enter a lesson name');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 获取当前登录用户
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        Alert.alert('Error', 'User not authenticated');
        setLoading(false);
        return;
      }

      // 创建 Lesson
      const insertData: any = {
        name: lessonName.trim(),
        user_id: user.id,
      };

      if (description.trim()) {
        insertData.description = description.trim();
      }

      if (deadline) {
        // 格式化为 ISO 字符串 (YYYY-MM-DDTHH:mm:ss.sssZ)
        insertData.deadline = deadline.toISOString();
      }

      insertData.is_vocab_mode = isVocabMode;

      const { data: lessonData, error: lessonError } = await supabase
        .from('lessons')
        .insert([insertData])
        .select()
        .single();

      if (lessonError) {
        console.error('Error creating lesson:', lessonError);
        setError(lessonError.message);
        Alert.alert('Error', lessonError.message);
        setLoading(false);
        return;
      }

      if (!lessonData || !lessonData.id) {
        setError('Failed to get created lesson ID');
        Alert.alert('Error', 'Failed to get created lesson ID');
        setLoading(false);
        return;
      }

      // 成功：跳转到添加词条页面，带上 fromCreate=true 标记
      setLoading(false);
      router.replace({
        pathname: `/lessons/${lessonData.id}/add-terms`,
        params: { fromCreate: 'true', id: lessonData.id },
      } as any);
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
      setLoading(false);
    }
  };

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
          {/* 标题 */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Create Lesson</Text>
          </View>

          {/* 错误提示 */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Lesson Name 输入 */}
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
              editable={!loading}
            />
          </View>

          {/* Description 输入 */}
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
              editable={!loading}
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
                  loading && styles.switchDisabled,
                ]}
                onPress={() => !loading && setIsVocabMode(!isVocabMode)}
                disabled={loading}
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
                    },
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Deadline 选择 */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, styles.labelInRow]}>Deadline</Text>
              {deadline && (
                <TouchableOpacity
                  onPress={() => setDeadline(null)}
                  style={styles.clearButton}
                  disabled={loading}
                >
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.input}
              onPress={() => !loading && setShowDatePicker(true)}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.datePickerText,
                  !deadline && styles.datePickerPlaceholder,
                ]}
              >
                {deadline
                  ? deadline.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Select deadline (optional)'}
            </Text>
            </TouchableOpacity>
          </View>

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
                      />
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

          {/* 创建按钮 */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleCreateLesson}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Create Lesson</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
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
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
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
    color: '#3B82F6',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#4E49FC',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
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
