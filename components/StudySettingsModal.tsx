import { Toggle } from '@/components/ui/Toggle';
import { layout } from '@/theme/spacing';
import { homeColors } from '@/theme/colors';
import { fonts } from '@/theme';
import { sheet } from '@/theme/sheet';
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
import { colors } from '@/theme/colors';

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
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Toolbar */}
            <View style={styles.toolbar}>
              {/* Title and Controls */}
              <View style={styles.titleAndControls}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close study settings"
                  style={styles.closeButton}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <CloseIcon size={24} color={colors.text} />
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
                <Toggle label="Answer with term" value={settings.answerWith.term} onValueChange={(value) => handleUpdateAnswerWith('term', value)} />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Definition</Text>
                <Toggle label="Answer with definition" value={settings.answerWith.definition} onValueChange={(value) => handleUpdateAnswerWith('definition', value)} />
              </View>
            </View>

            {/* Section 2: Question types */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Question types</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>True/False</Text>
                <Toggle label="True or false questions" value={settings.questionTypes.trueFalse} onValueChange={(value) => handleUpdateQuestionTypes('trueFalse', value)} />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Multiple choice</Text>
                <Toggle label="Multiple choice questions" value={settings.questionTypes.mcq} onValueChange={(value) => handleUpdateQuestionTypes('mcq', value)} />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Written</Text>
                <Toggle label="Written questions" value={settings.questionTypes.written} onValueChange={(value) => handleUpdateQuestionTypes('written', value)} />
              </View>
            </View>

            {/* Section 3: Grading options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Grading options</Text>

              {/* Relaxed */}
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioRow}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: settings.grading === 'relaxed' }}
                  onPress={() => handleUpdateGrading('relaxed')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.radioLabel}>Relaxed</Text>
                  <View style={[styles.radioButton, settings.grading === 'relaxed' && styles.radioButtonOn]}>
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
                  accessibilityRole="radio"
                  accessibilityState={{ checked: settings.grading === 'moderate' }}
                  onPress={() => handleUpdateGrading('moderate')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.radioLabel}>Moderate</Text>
                  <View style={[styles.radioButton, settings.grading === 'moderate' && styles.radioButtonOn]}>
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
                  accessibilityRole="radio"
                  accessibilityState={{ checked: settings.grading === 'strict' }}
                  onPress={() => handleUpdateGrading('strict')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.radioLabel}>Strict</Text>
                  <View style={[styles.radioButton, settings.grading === 'strict' && styles.radioButtonOn]}>
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
  container: { flex: 1, ...sheet.surface },
  toolbar: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 18,
  },
  titleAndControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenInline,
    paddingVertical: 0,
    width: '100%',
    position: 'relative',
  },
  closeButton: {
    width: 44,
    minHeight: 44,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.43,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenInline,
    paddingBottom: 24,
    gap: 24,
  },
  section: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    padding: 18,
    gap: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: 0.4063,
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.muted,
    letterSpacing: 0.4063,
  },
  radioGroup: {
    gap: 12,
  },
  radioRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radioLabel: {
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 24,
    color: homeColors.darkest,
  },
  // A round one. It was a 44 by 44 rounded square — square because nothing said
  // otherwise, and 44 because the tap target was being built out of the mark itself.
  // The row is the tap target, so the mark is only a mark.
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: homeColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonOn: { borderColor: homeColors.primary },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: homeColors.primary,
  },
  radioDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.muted,
    letterSpacing: 0.4063,
    lineHeight: 20,
  },
});

