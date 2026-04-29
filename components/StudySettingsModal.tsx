import { StatusBar } from 'expo-status-bar';
import React from 'react';
import CloseIcon from '@/components/icons/CloseIcon';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 设置数据类型定义
export type StudySettings = {
  answerWith: {
    term: boolean;
    definition: boolean;
  };
  questionTypes: {
    trueFalse: boolean;
    mcq: boolean;
    written: boolean;
  };
  grading: 'relaxed' | 'moderate' | 'strict';
};

interface StudySettingsModalProps {
  visible: boolean;
  onClose: () => void;
  settings: StudySettings;
  onUpdateSettings: (settings: StudySettings) => void;
}

export default function StudySettingsModal({
  visible,
  onClose,
  settings,
  onUpdateSettings,
}: StudySettingsModalProps) {

  const handleUpdateAnswerWith = (key: 'term' | 'definition', value: boolean) => {
    onUpdateSettings({
      ...settings,
      answerWith: {
        ...settings.answerWith,
        [key]: value,
      },
    });
  };

  const handleUpdateQuestionTypes = (
    key: 'trueFalse' | 'mcq' | 'written',
    value: boolean
  ) => {
    onUpdateSettings({
      ...settings,
      questionTypes: {
        ...settings.questionTypes,
        [key]: value,
      },
    });
  };

  const handleUpdateGrading = (value: 'relaxed' | 'moderate' | 'strict') => {
    onUpdateSettings({
      ...settings,
      grading: value,
    });
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
            {/* Toolbar */}
            <View style={styles.toolbar}>
              {/* Title and Controls */}
              <View style={styles.titleAndControls}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <CloseIcon size={24} color="#0A0A0A" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Setting</Text>
                <View style={styles.headerSpacer} />
              </View>
            </View>

            {/* 内容区域 */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
            {/* Section 1: Answer with */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Answer with</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Term</Text>
                <Switch
                  value={settings.answerWith.term}
                  onValueChange={(value) => handleUpdateAnswerWith('term', value)}
                  trackColor={{ false: '#E5E7EB', true: '#4E49FC' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E5E7EB"
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Definition</Text>
                <Switch
                  value={settings.answerWith.definition}
                  onValueChange={(value) => handleUpdateAnswerWith('definition', value)}
                  trackColor={{ false: '#E5E7EB', true: '#4E49FC' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E5E7EB"
                />
              </View>
            </View>

            {/* Section 2: Question types */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Question types</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>True/False</Text>
                <Switch
                  value={settings.questionTypes.trueFalse}
                  onValueChange={(value) => handleUpdateQuestionTypes('trueFalse', value)}
                  trackColor={{ false: '#E5E7EB', true: '#4E49FC' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E5E7EB"
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Multiple choice</Text>
                <Switch
                  value={settings.questionTypes.mcq}
                  onValueChange={(value) => handleUpdateQuestionTypes('mcq', value)}
                  trackColor={{ false: '#E5E7EB', true: '#4E49FC' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E5E7EB"
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Written</Text>
                <Switch
                  value={settings.questionTypes.written}
                  onValueChange={(value) => handleUpdateQuestionTypes('written', value)}
                  trackColor={{ false: '#E5E7EB', true: '#4E49FC' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor="#E5E7EB"
                />
              </View>
            </View>

            {/* Section 3: Grading options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grading options</Text>

              {/* Relaxed */}
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => handleUpdateGrading('relaxed')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.radioLabel}>Relaxed</Text>
                  <View style={styles.radioButton}>
                    {settings.grading === 'relaxed' && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.radioDescription}>
                  Focus on meaning. Answers are accepted if the definition is correct, even with
                  synonyms, rephrasing, or typos.
                </Text>
              </View>

              {/* Moderate */}
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => handleUpdateGrading('moderate')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.radioLabel}>Moderate</Text>
                  <View style={styles.radioButton}>
                    {settings.grading === 'moderate' && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.radioDescription}>
                  Exact match required, but misspellings are accepted (e.g., accent marks, missing
                  letters).
                </Text>
              </View>

              {/* Strict */}
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioRow}
                  onPress={() => handleUpdateGrading('strict')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.radioLabel}>Strict</Text>
                  <View style={styles.radioButton}>
                    {settings.grading === 'strict' && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.radioDescription}>
                  Exact match required. Only smaller stylistic mistakes are accepted (case,
                  punctuation, or text in parentheses).
                </Text>
              </View>
            </View>
          </ScrollView>
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
  toolbar: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 18,
  },
  titleAndControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 0,
    width: '100%',
    position: 'relative',
  },
  closeButton: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(120, 116, 150, 0.08)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: -0.43,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 24,
  },
  section: {
    backgroundColor: 'rgba(120, 116, 150, 0.08)',
    borderRadius: 16,
    padding: 18,
    gap: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: 0.4063,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6A7282',
    letterSpacing: 0.4063,
  },
  radioGroup: {
    gap: 12,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radioLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6A7282',
    letterSpacing: 0.4063,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#6A7282',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4E49FC',
  },
  radioDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6A7282',
    letterSpacing: 0.4063,
    lineHeight: 20,
  },
});

