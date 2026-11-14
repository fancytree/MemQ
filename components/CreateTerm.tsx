import { layout } from '@/theme/spacing';
import { BackButton } from '@/components/ui/RoundButtons';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

interface TermRow {
  id: string;
  term: string;
  definition: string;
  explanation: string;
}

interface CreateTermProps {
  lessonId: string;
}

export default function CreateTerm({ lessonId }: CreateTermProps) {
  const [terms, setTerms] = useState<TermRow[]>([
    { id: '1', term: '', definition: '', explanation: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [nextId, setNextId] = useState(2);

  // 添加新行
  const handleAddRow = () => {
    setTerms([...terms, { id: nextId.toString(), term: '', definition: '', explanation: '' }]);
    setNextId(nextId + 1);
  };

  // 删除行
  const handleDeleteRow = (id: string) => {
    if (terms.length === 1) {
      Alert.alert('Error', 'At least one row is required');
      return;
    }
    setTerms(terms.filter((term) => term.id !== id));
  };

  // 更新行数据
  const handleUpdateTerm = (id: string, field: 'term' | 'definition' | 'explanation', value: string) => {
    setTerms(
      terms.map((term) => (term.id === id ? { ...term, [field]: value } : term))
    );
  };

  // 保存所有词条
  const handleSave = async () => {
    // 验证所有行
    const emptyRows = terms.filter((t) => !t.term.trim() || !t.definition.trim());
    if (emptyRows.length > 0) {
      Alert.alert('Error', 'Please fill in both Term and Definition for all rows');
      return;
    }

    setLoading(true);
    try {
      // 构建插入数据
      const insertData = terms
        .filter((t) => t.term.trim() && t.definition.trim())
        .map((t) => ({
          lesson_id: lessonId,
          term: t.term.trim(),
          definition: t.definition.trim(),
          explanation: t.explanation.trim() || null,
        }));

      if (insertData.length === 0) {
        Alert.alert('Error', 'No valid terms to save');
        setLoading(false);
        return;
      }

      // 插入数据
      const { error, data } = await supabase.from('terms').insert(insertData).select();

      if (error) {
        console.error('Error saving terms:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));

        // 如果错误是因为找不到 definition 列，提供明确的提示
        if (error.code === 'PGRST204' && error.message?.includes('definition')) {
          Alert.alert(
            '数据库结构错误',
            '找不到 "definition" 列。\n\n请在 Supabase Dashboard 的 SQL Editor 中执行以下 SQL：\n\nALTER TABLE public.terms RENAME COLUMN back TO definition;\nNOTIFY pgrst, \'reload schema\';\n\n执行后等待几秒钟让 schema cache 刷新，然后重试。',
            [{ text: '确定' }]
          );
        } else {
          Alert.alert('Error', error.message || 'Failed to save terms');
        }
        setLoading(false);
        return;
      }

      // 成功提示
      Alert.alert('Success', `Successfully saved ${insertData.length} term(s)!`, [
        {
          text: 'OK',
          onPress: () => {
            // 跳转到 /lessons 页面（如果存在）或返回首页
            router.replace('/(tabs)');
          },
        },
      ]);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* 顶部导航栏 */}
        <View style={styles.header}>
          <BackButton onPress={() => safeBack('/(tabs)/library')} label="Back to Library" />
          <Text style={styles.headerTitle}>Add Terms</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* 说明文字 */}
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              Add terms manually. Fill in both Term and Definition for each row.
            </Text>
          </View>

          {/* 词条列表 */}
          {terms.map((termRow, index) => (
            <View key={termRow.id} style={styles.termRow}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowNumber}>Row {index + 1}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove term"
                  onPress={() => handleDeleteRow(termRow.id)}
                  style={styles.deleteButton}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={20} color={colors.red} />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Term</Text>
                <TextInput accessibilityLabel="e.g., Ambition"
                  style={styles.input}
                  placeholder="e.g., Ambition"
                  placeholderTextColor={colors.muted}
                  value={termRow.term}
                  onChangeText={(value) => handleUpdateTerm(termRow.id, 'term', value)}
                  editable={!loading}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Definition</Text>
                <TextInput accessibilityLabel="e.g., A strong desire to achieve something"
                  style={[styles.input, styles.textarea]}
                  placeholder="e.g., A strong desire to achieve something"
                  placeholderTextColor={colors.muted}
                  value={termRow.definition}
                  onChangeText={(value) =>
                    handleUpdateTerm(termRow.id, 'definition', value)
                  }
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!loading}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  Explanation (Optional)
                </Text>
                <TextInput accessibilityLabel="Enter explanation (optional)"
                  style={[styles.input, styles.textarea]}
                  placeholder="Enter explanation (optional)"
                  placeholderTextColor={colors.muted}
                  value={termRow.explanation}
                  onChangeText={(value) =>
                    handleUpdateTerm(termRow.id, 'explanation', value)
                  }
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!loading}
                />
              </View>
            </View>
          ))}

          {/* 添加行按钮 */}
          <TouchableOpacity accessibilityRole="button"
            style={styles.addRowButton}
            onPress={handleAddRow}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={20} color={colors.accentText} />
            <Text style={styles.addRowButtonText}>Add Row</Text>
          </TouchableOpacity>

          {/* 保存按钮 */}
          <TouchableOpacity accessibilityRole="button"
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.surf} />
            ) : (
              <Text style={styles.saveButtonText}>Save Terms</Text>
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
    backgroundColor: colors.surf,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenInline,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20, paddingHorizontal: layout.screenInline,
    paddingBottom: 40,
  },
  infoContainer: {
    backgroundColor: colors.infoL,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.infoL,
  },
  infoText: {
    fontSize: 14,
    color: colors.info,
    lineHeight: 20,
  },
  termRow: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rowNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  deleteButton: { minHeight: 44,
    padding: 4,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  input: { minHeight: 44,
    backgroundColor: colors.surf,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  textarea: {
    minHeight: 80,
    paddingTop: 10,
  },
  addRowButton: { minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surf,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.action,
    borderStyle: 'dashed',
  },
  addRowButtonText: {
    color: colors.action,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  saveButton: { minHeight: 44,
    backgroundColor: colors.action,
    borderRadius: 100,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0,
    shadowRadius: 4,
    elevation: 0,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.onAction,
    fontSize: 18,
    fontWeight: '600',
  },
});

