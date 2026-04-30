import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 术语类型定义
interface Term {
  id: string;
  lesson_id: string;
  term: string;
  definition: string;
  explanation: string | null;
  created_at: string;
}

// 问题类型定义
interface Question {
  targetTerm: Term;
  correctAnswer: string;
  wrongOptions: string[];
  allOptions: string[];
  correctIndex: number;
}

export default function LearnScreen() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);

  // 获取所有术语
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // 先获取用户的所有 lessons
        const { data: lessonsData, error: lessonsError } = await supabase
          .from('lessons')
          .select('id')
          .eq('user_id', user.id);

        if (lessonsError) {
          console.error('Error fetching lessons:', lessonsError);
          Alert.alert('Error', 'Failed to load lessons');
          setLoading(false);
          return;
        }

        if (!lessonsData || lessonsData.length === 0) {
          setTerms([]);
          setLoading(false);
          return;
        }

        // 通过 lesson_ids 获取所有 terms
        const lessonIds = lessonsData.map((lesson) => lesson.id);
        const { data, error } = await supabase
          .from('terms')
          .select('*')
          .in('lesson_id', lessonIds)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching terms:', error);
          Alert.alert('Error', 'Failed to load terms');
          setLoading(false);
          return;
        }

        if (data && data.length < 4) {
          setTerms([]);
          setLoading(false);
          return;
        }

        setTerms(data || []);
        generateQuestions(data || []);
        setLoading(false);
      } catch (error) {
        console.error('Error:', error);
        Alert.alert('Error', 'Something went wrong');
        setLoading(false);
      }
    };

    fetchTerms();
  }, []);

  // 生成问题
  const generateQuestions = (termsList: Term[]) => {
    // 确保至少有4个术语
    if (termsList.length < 4) {
      setQuestions([]);
      return;
    }

    // 随机选择最多5个术语作为问题（如果术语少于5个，则选择所有）
    const shuffled = [...termsList].sort(() => Math.random() - 0.5);
    const questionCount = Math.min(5, termsList.length);
    const selectedTerms = shuffled.slice(0, questionCount);

    const generatedQuestions: Question[] = selectedTerms.map((targetTerm) => {
      // 获取错误选项（从其他术语中随机选择3个定义）
      const otherTerms = termsList.filter((t) => t.id !== targetTerm.id);
      const shuffledOthers = [...otherTerms].sort(() => Math.random() - 0.5);
      
      // 确保至少有3个错误选项，如果不够则使用所有可用的
      const wrongOptionsCount = Math.min(3, otherTerms.length);
      const wrongOptions = shuffledOthers
        .slice(0, wrongOptionsCount)
        .map((t) => t.definition);

      // 合并正确答案和错误选项
      const allOptions = [targetTerm.definition, ...wrongOptions];
      // 随机打乱选项顺序
      const shuffledOptions = allOptions.sort(() => Math.random() - 0.5);
      const correctIndex = shuffledOptions.indexOf(targetTerm.definition);

      return {
        targetTerm,
        correctAnswer: targetTerm.definition,
        wrongOptions,
        allOptions: shuffledOptions,
        correctIndex,
      };
    });

    setQuestions(generatedQuestions);
  };

  // 处理选项点击
  const handleOptionClick = (index: number) => {
    if (buttonsDisabled) return;

    setSelectedOptionIndex(index);
    setButtonsDisabled(true);
    setShowResult(true);
  };

  // 处理下一题
  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedOptionIndex(null);
      setShowResult(false);
      setShowHint(false);
      setButtonsDisabled(false);
    } else {
      // 完成会话，更新进度
      await updateProgress();
      setSessionComplete(true);
    }
  };

  // 更新用户进度
  const updateProgress = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      const questionCount = questions.length;

      // 先检查今天是否已有记录
      const { data: existingData, error: selectError } = await supabase
        .from('user_daily_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      // 如果查询出错且不是"未找到记录"的错误，记录日志
      if (selectError && selectError.code !== 'PGRST116') {
        console.error('Error checking progress:', selectError);
      }

      if (existingData) {
        // 更新现有记录
        const { error } = await supabase
          .from('user_daily_progress')
          .update({
            questions_completed: (existingData.questions_completed || 0) + questionCount,
          })
          .eq('id', existingData.id);

        if (error) {
          console.error('Error updating progress:', error);
        }
      } else {
        // 创建新记录
        const { error } = await supabase
          .from('user_daily_progress')
          .insert([
            {
              user_id: user.id,
              date: today,
              questions_completed: questionCount,
            },
          ]);

        if (error) {
          console.error('Error creating progress:', error);
        }
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  // 如果术语不足
  if (!loading && terms.length < 4) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Not enough terms to generate a quiz. Please add at least 4 terms.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => safeBack('/(tabs)')}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 如果会话完成
  if (sessionComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.completeContainer}>
          <Feather name="check-circle" size={64} color="#10B981" />
          <Text style={styles.completeTitle}>Session Complete!</Text>
          <Text style={styles.completeText}>
            You've completed all 5 questions. Great job!
          </Text>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.7}
          >
            <Text style={styles.homeButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 加载中
  if (loading || questions.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isCorrect = selectedOptionIndex === currentQuestion.correctIndex;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 头部：问题进度 */}
        <View style={styles.header}>
          <Text style={styles.progressText}>
            Question {currentQuestionIndex + 1} of {questions.length}
          </Text>
        </View>

        {/* 主卡片：显示术语 */}
        <View style={styles.termCard}>
          <Text style={styles.termText}>{currentQuestion.targetTerm.term}</Text>
        </View>

        {/* 选项按钮 */}
        <View style={styles.optionsContainer}>
          {currentQuestion.allOptions.map((option, index) => {
            let buttonStyle: any[] = [styles.optionButton];
            let textStyle: any[] = [styles.optionText];

            if (showResult) {
              if (index === currentQuestion.correctIndex) {
                buttonStyle = [styles.optionButton, styles.correctButton];
                textStyle = [styles.optionText, styles.correctText];
              } else if (index === selectedOptionIndex && index !== currentQuestion.correctIndex) {
                buttonStyle = [styles.optionButton, styles.wrongButton];
                textStyle = [styles.optionText, styles.wrongText];
              }
            }

            if (buttonsDisabled) {
              buttonStyle.push(styles.optionButtonDisabled);
            }

            return (
              <TouchableOpacity
                key={index}
                style={buttonStyle}
                onPress={() => handleOptionClick(index)}
                disabled={buttonsDisabled}
                activeOpacity={0.7}
              >
                <Text style={textStyle}>{option}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 结果显示 */}
        {showResult && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </Text>
            <View style={styles.resultContent}>
              <Text style={styles.resultLabel}>Definition:</Text>
              <Text style={styles.resultText}>
                {currentQuestion.targetTerm.definition}
              </Text>
              {currentQuestion.targetTerm.explanation && (
                <>
                  <Text style={[styles.resultLabel, styles.resultLabelMargin]}>
                    Explanation:
                  </Text>
                  <Text style={styles.resultText}>
                    {currentQuestion.targetTerm.explanation}
                  </Text>
                </>
              )}
            </View>
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.7}
            >
              <Text style={styles.nextButtonText}>
                {currentQuestionIndex < questions.length - 1
                  ? 'Next Question'
                  : 'Complete Session'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  completeText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  homeButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  homeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
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
    marginBottom: 24,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  termCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  termText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  hintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  hintButtonText: {
    fontSize: 14,
    color: '#3B82F6',
    marginLeft: 6,
    fontWeight: '500',
  },
  hintContainer: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  hintText: {
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  optionsContainer: {
    marginBottom: 24,
  },
  optionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  optionButtonDisabled: {
    opacity: 0.7,
  },
  correctButton: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  wrongButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  optionText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 22,
  },
  correctText: {
    color: '#065F46',
    fontWeight: '600',
  },
  wrongText: {
    color: '#991B1B',
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  resultContent: {
    marginBottom: 20,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
    marginBottom: 4,
  },
  resultLabelMargin: {
    marginTop: 16,
  },
  resultText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  nextButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

