import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AIStudyAssistantModalProps {
  visible: boolean;
  onClose: () => void;
  lessonId?: string;
}

export default function AIStudyAssistantModal({
  visible,
  onClose,
  lessonId,
}: AIStudyAssistantModalProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'initial' | 'chat'>('initial');

  // 处理上传文件
  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        Alert.alert('File Selected', `Selected: ${result.assets[0].name}`);
        // TODO: 实现文件上传和处理逻辑
      }
    } catch (err) {
      console.error('Error selecting file:', err);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  // 处理发送消息
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) {
      return;
    }

    const userInput = inputText.trim();
    setInputText('');
    setIsLoading(true);
    setMode('chat');

    try {
      // 获取用户所有课程
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, name')
        .eq('user_id', user.id);

      if (lessonsError) {
        console.error('Error fetching lessons:', lessonsError);
        throw new Error('Failed to fetch lessons');
      }

      const userLessons = lessonsData || [];

      // 调用 chat-extractor API
      const { data: apiData, error: apiError } = await supabase.functions.invoke(
        'chat-extractor',
        {
          body: {
            messages: [
              {
                role: 'user',
                content: userInput,
              },
            ],
            user_lessons: userLessons.map((lesson) => ({
              id: lesson.id,
              name: lesson.name,
            })),
          },
        }
      );

      if (apiError) {
        console.error('Error calling chat-extractor:', apiError);
        throw new Error(apiError.message || 'Failed to get AI response');
      }

      if (!apiData || !apiData.success) {
        throw new Error('Invalid response from API');
      }

      const { reply_text, extracted_term } = apiData.data;

      // 如果有提取的 term，提示用户保存
      if (extracted_term) {
        Alert.alert(
          'Term Extracted',
          `Term: ${extracted_term.term}\nDefinition: ${extracted_term.definition}\n\nWould you like to save it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save',
              onPress: async () => {
                // TODO: 实现保存 term 的逻辑
                Alert.alert('Success', 'Term saved successfully!');
              },
            },
          ]
        );
      }

      // 显示 AI 回复
      Alert.alert('AI Response', reply_text);
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理选项按钮点击
  const handleOptionPress = (option: 'ask') => {
    if (option === 'ask') {
      setMode('chat');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {mode !== 'initial' && (
          <>
            {/* Header - 聊天模式时显示 */}
            <View style={styles.header}>
              {/* Grabber */}
              <View style={styles.grabber} />
              
              {/* Title and Controls */}
              <View style={styles.headerContent}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={24} color="#787496" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Study Buddy</Text>
                <View style={styles.headerSpacer} />
              </View>
            </View>
          </>
        )}

        {/* Content */}
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={styles.content}>
            {mode === 'initial' ? (
              <>

                {/* 渐变圆形图标 */}
                <View style={styles.iconContainer}>
                  <LinearGradient
                    colors={['#AD46FF', '#2B7FFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconGradient}
                  >
                    <Feather name="zap" size={32} color="#FFFFFF" />
                  </LinearGradient>
                </View>

                {/* 选项按钮 */}
                <View style={styles.optionsContainer}>
                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={() => handleOptionPress('ask')}
                    activeOpacity={0.7}
                  >
                    <Feather name="search" size={20} color="#0A0A0A" />
                    <Text style={styles.optionText}>Ask any question</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {/* 输入框 */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Ask, search, or make anything"
                placeholderTextColor="#C6C7CB"
                value={inputText}
                onChangeText={setInputText}
                multiline
                autoCapitalize="sentences"
                autoCorrect={true}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                editable={!isLoading}
              />
              <View style={styles.inputActions}>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handleUpload}
                  activeOpacity={0.7}
                >
                  <Feather name="paperclip" size={16} color="#6A7282" />
                  <Text style={styles.uploadText}>Upload</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
                  ]}
                  onPress={handleSend}
                  activeOpacity={0.7}
                  disabled={!inputText.trim() || isLoading}
                >
                  <Feather
                    name="arrow-up"
                    size={18}
                    color={inputText.trim() && !isLoading ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 0,
  },
  grabber: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 10,
    minHeight: 50,
    width: '100%',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: -0.43,
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -50 }],
  },
  headerSpacer: {
    width: 40,
  },
  initialHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 100,
  },
  initialCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 48,
    justifyContent: 'flex-end',
    gap: 24,
  },
  iconContainer: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16.615,
    paddingVertical: 12.615,
    borderRadius: 16.4,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#0A0A0A',
    letterSpacing: -0.3125,
    lineHeight: 24,
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: 106,
    justifyContent: 'space-between',
  },
  input: {
    fontSize: 16,
    fontWeight: '400',
    color: '#0A0A0A',
    letterSpacing: -0.3125,
    lineHeight: 24,
    flex: 1,
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'top',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6A7282',
    letterSpacing: -0.3125,
    lineHeight: 24,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(78, 73, 252, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '90deg' }],
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(78, 73, 252, 0.32)',
    opacity: 0.5,
  },
});

