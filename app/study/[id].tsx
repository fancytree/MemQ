import AnswerBackCard from '@/components/AnswerBackCard';
import FlipCard from '@/components/FlipCard';
import StudySettingsModal, { StudySettings } from '@/components/StudySettingsModal';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/safeBack';
import React, { useEffect, useRef, useState } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

// 题目类型定义
interface Question {
  id: string;
  term_id: string;
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'fill_blank';
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
}

// 打乱数组顺序的辅助函数
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 用户进度类型定义
interface UserTermProgress {
  term_id: string;
  status: 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
  next_review_at: string | null;
}

interface LessonTerm {
  id: string;
  term: string;
  definition: string;
  lesson_id: string;
}

// Session 大小配置
const MAX_SESSION_SIZE = 20;

export default function StudySessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]); // 保存所有题目，用于"Review All Anyway"
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAllCaughtUp, setIsAllCaughtUp] = useState(false);
  const [reviewAllMode, setReviewAllMode] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const fillBlankInputRef = useRef<TextInput>(null);
  
  // 学习设置状态
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [studySettings, setStudySettings] = useState<StudySettings>({
    answerWith: {
      term: true,
      definition: true,
    },
    questionTypes: {
      trueFalse: true,
      mcq: true,
      written: true,
    },
    grading: 'moderate',
  });

  // 存储 terms 数据（用于 answerWith 功能）
  const [termsMap, setTermsMap] = useState<Map<string, { term: string; definition: string }>>(new Map());

  // 获取题目数据（SRS 智能筛选）
  useEffect(() => {
    const fetchQuestions = async () => {
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

        // 判断是否为 "today" 模式（从所有 lessons 获取今天需要学习的词）
        const isTodayMode = id === 'today';

        // 第一步：获取 terms（根据模式选择）
        let termsData: LessonTerm[] = [];
        let termsError: any = null;

        if (isTodayMode) {
          // Today 模式：从所有 lessons 获取今天需要学习的词
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayISO = today.toISOString();

          // 获取所有需要今天复习的词
          const { data: dueTermsData } = await supabase
            .from('user_term_progress')
            .select(`
              term_id,
              terms!inner(
                id,
                term,
                definition,
                lesson_id
              )
            `)
            .eq('user_id', user.id)
            .or(`next_review_at.lte.${todayISO},status.eq.New`);

          // 获取所有没有进度记录的新词
          const { data: allTermsData } = await supabase
            .from('terms')
            .select(`
              id,
              term,
              definition,
              lesson_id,
              lessons!inner(
                id,
                user_id
              )
            `)
            .eq('lessons.user_id', user.id);

          // 合并需要复习的词和新词
          const progressTermIds = new Set<string>();
          if (dueTermsData) {
            dueTermsData.forEach((item) => {
              const relationTerm = Array.isArray(item.terms) ? item.terms[0] : item.terms;
              if (item.term_id && relationTerm) {
                progressTermIds.add(item.term_id);
                termsData.push({
                  id: relationTerm.id,
                  term: relationTerm.term,
                  definition: relationTerm.definition,
                  lesson_id: relationTerm.lesson_id,
                });
              }
            });
          }

          // 添加新词（没有进度记录的）
          if (allTermsData) {
            allTermsData.forEach((term) => {
              if (!progressTermIds.has(term.id)) {
                termsData.push({
                  id: term.id,
                  term: term.term,
                  definition: term.definition,
                  lesson_id: term.lesson_id,
                });
              }
            });
          }
        } else {
          // 单 lesson 模式：获取该 lesson 的所有 terms
          const result = await supabase
            .from('terms')
            .select('id, term, definition, lesson_id')
            .eq('lesson_id', id);
          
          termsData = result.data || [];
          termsError = result.error;
        }

        if (termsError) {
          console.error('Error fetching terms:', termsError);
          setError('Failed to load questions');
          setLoading(false);
          return;
        }

        if (!termsData || termsData.length === 0) {
          if (isTodayMode) {
            setError('No terms to review today');
          } else {
            setError('No terms found for this lesson');
          }
          setLoading(false);
          return;
        }

        const termIds = termsData.map((t) => t.id);

        // 构建 terms 映射（用于 answerWith 功能）
        const termsMapData = new Map<string, { term: string; definition: string }>();
        termsData.forEach((term) => {
          termsMapData.set(term.id, {
            term: term.term,
            definition: term.definition,
          });
        });
        setTermsMap(termsMapData);

        // 第二步：并行获取所有 questions 和 user_term_progress
        const [questionsResult, progressResult] = await Promise.all([
          // 获取所有 questions
          supabase
            .from('questions')
            .select('*')
            .in('term_id', termIds),
          // 获取用户进度
          supabase
            .from('user_term_progress')
            .select('term_id, status, next_review_at')
            .eq('user_id', user.id)
            .in('term_id', termIds),
        ]);

        if (questionsResult.error) {
          console.error('Error fetching questions:', questionsResult.error);
          setError('Failed to load questions');
          setLoading(false);
          return;
        }

        if (!questionsResult.data || questionsResult.data.length === 0) {
          setError('No questions found. Please generate questions first.');
          setLoading(false);
          return;
        }

        // 根据 questionTypes 和 answerWith 设置过滤题目
        const filteredQuestions = questionsResult.data.filter((question) => {
          // 1. 根据 questionTypes 过滤
          if (question.question_type === 'true_false' && !studySettings.questionTypes.trueFalse) {
            return false;
          }
          if (question.question_type === 'mcq' && !studySettings.questionTypes.mcq) {
            return false;
          }
          if (question.question_type === 'fill_blank' && !studySettings.questionTypes.written) {
            return false;
          }

          // 2. 根据 answerWith 过滤
          // 如果只选择了 term 或 definition，需要检查题目内容是否匹配
          // 由于题目已经生成，我们通过检查 correct_answer 是否匹配 term 或 definition 来判断
          const termData = termsMapData.get(question.term_id);
          if (termData) {
            const hasTerm = studySettings.answerWith.term;
            const hasDefinition = studySettings.answerWith.definition;

            // 如果两者都选，显示所有题目
            if (hasTerm && hasDefinition) {
              // 不过滤，显示所有题目
            } else if (hasTerm && !hasDefinition) {
              // 只显示 term 相关的题目：检查 correct_answer 是否完全匹配 term（忽略大小写）
              const answerLower = question.correct_answer.trim().toLowerCase();
              const termLower = termData.term.trim().toLowerCase();
              if (answerLower !== termLower) {
                return false;
              }
            } else if (!hasTerm && hasDefinition) {
              // 只显示 definition 相关的题目：检查 correct_answer 是否是 definition 的一部分或关键词
              const answerLower = question.correct_answer.trim().toLowerCase();
              const definitionLower = termData.definition.trim().toLowerCase();
              
              // 如果正确答案完全匹配 definition，或者 definition 包含正确答案，则显示
              // 否则检查是否是 definition 中的关键词（至少 3 个字符）
              if (
                answerLower === definitionLower ||
                definitionLower.includes(answerLower) ||
                (answerLower.length >= 3 && definitionLower.includes(answerLower))
              ) {
                // 匹配，显示
              } else {
                // 不匹配，过滤掉
                return false;
              }
            } else {
              // 两者都没选，不显示任何题目
              return false;
            }
          }

          return true;
        });

        if (filteredQuestions.length === 0) {
          setError('No questions match your selected question types. Please adjust your settings.');
          setLoading(false);
          return;
        }

        // 保存所有题目（用于"Review All Anyway"）
        const allQuestionsData = shuffleArray(filteredQuestions);
        setAllQuestions(allQuestionsData);

        // 如果是强制复习模式，直接使用所有题目
        if (reviewAllMode) {
          setQuestions(allQuestionsData.slice(0, MAX_SESSION_SIZE));
          setIsAllCaughtUp(false);
          setLoading(false);
          return;
        }

        // 第三步：构建进度映射
        const progressMap = new Map<string, UserTermProgress>();
        if (progressResult.data) {
          progressResult.data.forEach((progress) => {
            progressMap.set(progress.term_id, {
              term_id: progress.term_id,
              status: progress.status,
              next_review_at: progress.next_review_at,
            });
          });
        }

        // 第四步：SRS 筛选算法
        const now = new Date();
        const dueReviews: Question[] = [];
        const newItems: Question[] = [];

        filteredQuestions.forEach((question) => {
          const progress = progressMap.get(question.term_id);
          const isNew = !progress || progress.status === 'New';
          const isDue =
            progress &&
            progress.next_review_at &&
            new Date(progress.next_review_at) <= now;

          if (isDue) {
            // 第一优先级：到期的复习题
            dueReviews.push(question);
          } else if (isNew) {
            // 第二优先级：新词条
            newItems.push(question);
          }
          // 其他情况：未到期的已学习词条，不包含在本次复习中
        });

        // 第五步：组合和限制数量
        const prioritizedQuestions = [
          ...shuffleArray(dueReviews),
          ...shuffleArray(newItems),
        ].slice(0, MAX_SESSION_SIZE);

        // 第六步：检查是否为空
        if (prioritizedQuestions.length === 0) {
          setIsAllCaughtUp(true);
          setLoading(false);
          return;
        }

        setQuestions(prioritizedQuestions);
        setIsAllCaughtUp(false);
        setLoading(false);
      } catch (err) {
        console.error('Error:', err);
        setError('Something went wrong');
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [id, reviewAllMode, studySettings.questionTypes, studySettings.answerWith]);

  // 强制复习所有题目
  const handleReviewAll = () => {
    // 设置强制复习模式，触发 useEffect 重新获取数据
    setReviewAllMode(true);
    // 如果已经有所有题目数据，直接使用
    if (allQuestions.length > 0) {
      setQuestions(shuffleArray(allQuestions).slice(0, MAX_SESSION_SIZE));
      setIsAllCaughtUp(false);
    }
    // 否则 useEffect 会重新获取数据并在 reviewAllMode 为 true 时加载所有题目
  };

  // 根据 grading 设置判断答案是否正确
  const checkAnswerWithGrading = (
    userAnswer: string,
    correctAnswer: string,
    questionType: string
  ): boolean => {
    const userAnswerTrimmed = userAnswer.trim();
    const correctAnswerTrimmed = correctAnswer.trim();

    if (questionType === 'fill_blank') {
      // 填空题根据 grading 设置判断
      switch (studySettings.grading) {
        case 'relaxed':
          // Relaxed: 关注含义，接受同义词、改写、拼写错误
          // 简单的相似度检查：忽略大小写、标点、多余空格
          const userNormalized = userAnswerTrimmed
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const correctNormalized = correctAnswerTrimmed
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          // 如果完全匹配或包含主要关键词，认为正确
          return (
            userNormalized === correctNormalized ||
            userNormalized.includes(correctNormalized) ||
            correctNormalized.includes(userNormalized)
          );

        case 'moderate':
          // Moderate: 精确匹配，但接受拼写错误（如重音、缺失字母）
          // 忽略大小写、标点、多余空格，但要求主要字符匹配
          const userModerate = userAnswerTrimmed
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const correctModerate = correctAnswerTrimmed
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          // 计算相似度（简单的字符匹配）
          const similarity = calculateSimilarity(userModerate, correctModerate);
          return similarity >= 0.85; // 85% 相似度阈值

        case 'strict':
          // Strict: 精确匹配，只接受小的风格错误（大小写、标点、括号内的文本）
          // 忽略大小写、标点符号、括号内的内容
          const userStrict = userAnswerTrimmed
            .toLowerCase()
            .replace(/\([^)]*\)/g, '') // 移除括号内的内容
            .replace(/[^\w\s]/g, '') // 移除标点
            .replace(/\s+/g, ' ')
            .trim();
          const correctStrict = correctAnswerTrimmed
            .toLowerCase()
            .replace(/\([^)]*\)/g, '') // 移除括号内的内容
            .replace(/[^\w\s]/g, '') // 移除标点
            .replace(/\s+/g, ' ')
            .trim();
          return userStrict === correctStrict;

        default:
          // 默认使用 moderate
          return (
            userAnswerTrimmed.toLowerCase() === correctAnswerTrimmed.toLowerCase()
          );
      }
    } else {
      // MCQ / TrueFalse: 直接比较字符串（不受 grading 影响）
      return userAnswerTrimmed === correctAnswerTrimmed;
    }
  };

  // 计算字符串相似度（简单的 Levenshtein 距离）
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;

    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  };

  // Levenshtein 距离算法
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };

  // 检查答案
  const handleCheckAnswer = (answer?: string) => {
    const answerToCheck = answer || selectedAnswer;
    if (!answerToCheck.trim()) {
      Alert.alert('Please Answer', 'Please select or enter an answer before checking.');
      return;
    }

    const currentQuestion = questions[currentIndex];
    // 使用新的判分逻辑
    const isCorrect = checkAnswerWithGrading(
      answerToCheck,
      currentQuestion.correct_answer,
      currentQuestion.question_type
    );

    // 更新选中答案（如果是通过参数传入的）
    if (answer) {
      setSelectedAnswer(answer);
    }

    if (isCorrect) {
      setScore(score + 1);
      // 答对：成功震动
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      // 答错：错误震动
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    setShowFeedback(true);
    setShowExplanation(false); // 重置解析展开状态
    setIsFlipped(false); // 重置翻转状态，让用户手动翻转

    // 后台静默更新单词进度（Fire and Forget）
    supabase.functions
      .invoke('update-term-progress', {
        body: {
          term_id: currentQuestion.term_id,
          is_correct: isCorrect,
        },
      })
      .then((response) => {
        if (response.error) {
          console.error('Error updating term progress:', response.error);
        } else {
          console.log('Term progress updated successfully:', response.data);
        }
      })
      .catch((error) => {
        // 错误时在控制台打印，不影响用户体验
        console.error('Error updating term progress:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
      });

    // 自动跳转逻辑
    if (isCorrect) {
      // 答对：1200ms 后自动跳转
      const timer = setTimeout(() => {
        handleNext();
      }, 1200);
      setAutoAdvanceTimer(timer);
    }
    // 答错：不自动跳转，显示 Continue 按钮
  };

  // 处理选项选择（MCQ/TrueFalse）- 立即判分
  const handleSelectOption = (option: string) => {
    if (showFeedback) return;
    // 立即触发判分（传入选项作为答案）
    handleCheckAnswer(option);
  };

  // 处理"Don't Know"按钮（填空题）
  const handleDontKnow = () => {
    if (showFeedback) return;
    setSelectedAnswer('');
    setShowFeedback(true);
    setShowExplanation(false);
    setIsFlipped(false); // 重置翻转状态，让用户手动翻转
    // 答错：错误震动
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    const currentQuestion = questions[currentIndex];
    // 后台静默更新单词进度（Fire and Forget）
    supabase.functions
      .invoke('update-term-progress', {
        body: {
          term_id: currentQuestion.term_id,
          is_correct: false,
        },
      })
      .catch((error) => {
        console.error('Error updating term progress:', error);
      });
  };

  // 下一题
  const handleNext = () => {
    // 清除自动跳转定时器
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      setAutoAdvanceTimer(null);
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer('');
      setShowFeedback(false);
      setShowExplanation(false);
      setIsFlipped(false); // 重置翻转状态
    } else {
      // 最后一题，完成
      setIsFinished(true);
    }
  };

  // 处理翻转
  const handleFlip = () => {
    if (showFeedback) {
      setIsFlipped(!isFlipped);
    }
  };

  // 处理翻转回正面
  const handleFlipBack = () => {
    setIsFlipped(false);
  };

  // 返回课程列表
  const handleBack = () => {
    // 清理定时器
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      setAutoAdvanceTimer(null);
    }
    safeBack('/(tabs)/library');
  };

  // 清理定时器（组件卸载时）
  useEffect(() => {
    return () => {
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
      }
    };
  }, [autoAdvanceTimer]);

  // 题目切换时清理定时器
  useEffect(() => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      setAutoAdvanceTimer(null);
    }
  }, [currentIndex]);

  // 填空题：自动聚焦输入框
  useEffect(() => {
    if (questions.length > 0 && questions[currentIndex]?.question_type === 'fill_blank' && !showFeedback) {
      // 延迟聚焦，确保组件已渲染
      setTimeout(() => {
        fillBlankInputRef.current?.focus();
      }, 100);
    }
  }, [currentIndex, showFeedback, questions]);

  // 加载中
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 完成状态（没有到期的复习题和新词）
  if (isAllCaughtUp && !reviewAllMode) {
    return (
      <LinearGradient
        colors={['#F0F4FF', '#FFFFFF', '#F0FDF4']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.caughtUpContainer}>
              <Text style={styles.caughtUpIcon}>🎉</Text>
              <Text style={styles.caughtUpTitle}>You're all caught up!</Text>
              <Text style={styles.caughtUpSubtitle}>
                No reviews due right now. Great job!
              </Text>
              <TouchableOpacity
                style={styles.reviewAllButton}
                onPress={handleReviewAll}
                activeOpacity={0.8}
              >
                <Text style={styles.reviewAllButtonText}>Review All Anyway</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backButtonCaughtUp}
                onPress={handleBack}
                activeOpacity={0.8}
              >
                <Text style={styles.backButtonCaughtUpText}>Back to Lessons</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // 错误状态
  if (error || (questions.length === 0 && !isAllCaughtUp)) {
    return (
      <LinearGradient
        colors={['#F0F4FF', '#FFFFFF', '#F0FDF4']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>
              {error || 'No questions available'}
            </Text>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>Back to Lessons</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // 结算页面
  if (isFinished) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <LinearGradient
        colors={['#F0F4FF', '#FFFFFF', '#F0FDF4']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        <SafeAreaView style={styles.container} edges={['top']}>
          <View style={styles.summaryContainer}>
            <View style={styles.summaryContent}>
              <Feather name="check-circle" size={64} color="#10B981" />
              <Text style={styles.summaryTitle}>Session Complete!</Text>
              <Text style={styles.summaryScore}>
                {score} / {questions.length}
              </Text>
              <Text style={styles.summaryPercentage}>{percentage}% Correct</Text>
              <TouchableOpacity
                style={styles.summaryButton}
                onPress={handleBack}
                activeOpacity={0.8}
              >
                <Text style={styles.summaryButtonText}>Back to Lessons</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const currentQuestion = questions[currentIndex];
  // 计算是否答对（仅在 showFeedback 时计算）
  const isCorrect = showFeedback
    ? currentQuestion.question_type === 'fill_blank'
      ? selectedAnswer.trim().toLowerCase() ===
        currentQuestion.correct_answer.trim().toLowerCase()
      : selectedAnswer === currentQuestion.correct_answer
    : false;

  const progressPercentage = ((currentIndex + 1) / questions.length) * 100;

  return (
    <LinearGradient
      colors={['#F0F4FF', '#FFFFFF', '#F0FDF4']}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Header */}
          <View style={styles.header}>
            {/* 第一行：关闭按钮、标题、设置按钮 */}
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={handleBack}
                activeOpacity={0.7}
              >
                <View style={styles.closeButtonCircle}>
                  <Feather name="x" size={20} color="#787496" />
                </View>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Round 1</Text>
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => setSettingsVisible(true)}
                activeOpacity={0.7}
              >
                <Feather name="settings" size={24} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
            {/* 第二行：进度条 */}
            <View style={styles.progressBarContainer}>
              <Text style={styles.progressNumber}>{currentIndex + 1}</Text>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progressPercentage}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressNumber}>{questions.length}</Text>
            </View>
          </View>

          {/* Body - ScrollView */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              currentQuestion.question_type === 'fill_blank' && !showFeedback && styles.scrollContentWithInputBar,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
          {/* 翻转卡片容器 */}
          <FlipCard
            isFlipped={isFlipped}
            onFlip={handleFlip}
            canFlip={showFeedback}
            frontContent={
                <View style={styles.questionCard}>
                  <View style={styles.questionContent}>
                    {/* 题目文本区域 - fill container */}
                    <View style={styles.questionTextContainer}>
                      <Text style={styles.questionText}>
                        {currentQuestion.question_text}
                      </Text>
                    </View>

                    {/* 答案输入区域 */}
                    <View style={styles.answerContainer}>
              {currentQuestion.question_type === 'mcq' && (
                <View style={styles.mcqContainer}>
                  {/* 提示文字或反馈文字 */}
                  {showFeedback ? (
                    <Text
                      style={[
                        styles.feedbackText,
                        isCorrect
                          ? styles.feedbackTextCorrect
                          : styles.feedbackTextWrong,
                      ]}
                    >
                      {isCorrect
                        ? "You've Got this !"
                        : "No worries, Learning is a process !"}
                    </Text>
                  ) : (
                    <Text style={styles.chooseAnswerText}>Choose the answer</Text>
                  )}
                  <View style={styles.optionsContainer}>
                    {currentQuestion.options?.map((option, index) => {
                      const isSelected = selectedAnswer === option;
                      const isCorrectOption = option === currentQuestion.correct_answer;
                      const isWrongSelected = isSelected && !isCorrectOption && showFeedback;

                      // 样式逻辑
                      let buttonStyle: any[] = [styles.optionButton];
                      let textStyle: any[] = [styles.optionText];

                      if (showFeedback) {
                        if (isCorrectOption) {
                          if (isSelected) {
                            // 用户选对了：绿色实线边框 1.5px
                            buttonStyle.push(styles.optionButtonCorrect);
                          } else {
                            // 正确答案但用户没选：绿色虚线边框 1.5px（仅在答错时显示）
                            if (!isCorrect) {
                              buttonStyle.push(styles.optionButtonCorrectDashed);
                            }
                          }
                        } else if (isWrongSelected) {
                          // 用户选错的选项：橙色实线边框 1.5px
                          buttonStyle.push(styles.optionButtonWrong);
                        }
                      } else if (isSelected) {
                        // 选中状态（未提交）：蓝色边框
                        buttonStyle.push(styles.optionButtonSelected);
                        textStyle.push(styles.optionTextSelected);
                      }

                      return (
                        <TouchableOpacity
                          key={index}
                          style={buttonStyle}
                          onPress={() => handleSelectOption(option)}
                          disabled={showFeedback}
                          activeOpacity={0.7}
                        >
                          <Text style={textStyle}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {currentQuestion.question_type === 'true_false' && (
                <View style={styles.mcqContainer}>
                  {/* 提示文字或反馈文字 */}
                  {showFeedback ? (
                    <Text
                      style={[
                        styles.feedbackText,
                        isCorrect
                          ? styles.feedbackTextCorrect
                          : styles.feedbackTextWrong,
                      ]}
                    >
                      {isCorrect
                        ? "You've Got this !"
                        : "No worries, Learning is a process !"}
                    </Text>
                  ) : (
                    <Text style={styles.chooseAnswerText}>Choose the answer</Text>
                  )}
                  <View style={styles.optionsContainer}>
                    {['True', 'False'].map((option) => {
                      const isSelected = selectedAnswer === option;
                      const isCorrectOption = option === currentQuestion.correct_answer;
                      const isWrongSelected = isSelected && !isCorrectOption && showFeedback;

                      // 样式逻辑（与多选题一致）
                      let buttonStyle: any[] = [styles.optionButton];
                      let textStyle: any[] = [styles.optionText];

                      if (showFeedback) {
                        if (isCorrectOption) {
                          if (isSelected) {
                            // 用户选对了：绿色实线边框 1.5px
                            buttonStyle.push(styles.optionButtonCorrect);
                          } else {
                            // 正确答案但用户没选：绿色虚线边框 1.5px（仅在答错时显示）
                            if (!isCorrect) {
                              buttonStyle.push(styles.optionButtonCorrectDashed);
                            }
                          }
                        } else if (isWrongSelected) {
                          // 用户选错的选项：橙色实线边框 1.5px
                          buttonStyle.push(styles.optionButtonWrong);
                        }
                      } else if (isSelected) {
                        // 选中状态（未提交）：蓝色边框
                        buttonStyle.push(styles.optionButtonSelected);
                        textStyle.push(styles.optionTextSelected);
                      }

                      return (
                        <TouchableOpacity
                          key={option}
                          style={buttonStyle}
                          onPress={() => handleSelectOption(option)}
                          disabled={showFeedback}
                          activeOpacity={0.7}
                        >
                          <Text style={textStyle}>{option}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {currentQuestion.question_type === 'fill_blank' && (
                <View style={styles.fillBlankFeedbackContainer}>
                  {/* 反馈文字 */}
                  {showFeedback && (
                    <Animated.View entering={FadeInDown.duration(300)}>
                      <Text
                        style={[
                          styles.fillBlankFeedbackText,
                          isCorrect
                            ? styles.fillBlankFeedbackTextCorrect
                            : selectedAnswer === ''
                            ? styles.fillBlankFeedbackTextSkipped
                            : styles.fillBlankFeedbackTextWrong,
                        ]}
                      >
                        {isCorrect
                          ? 'Awesome'
                          : selectedAnswer === ''
                          ? "Give this one a try later!"
                          : "No sweat, you're still learning!"}
                      </Text>
                    </Animated.View>
                  )}

                  {/* 用户答案框 */}
                  {showFeedback && (
                    <Animated.View
                      entering={FadeInDown.duration(300).delay(100)}
                      style={styles.fillBlankAnswerContainer}
                    >
                      <View
                        style={[
                          styles.fillBlankAnswerBox,
                          isCorrect
                            ? styles.fillBlankAnswerBoxCorrect
                            : selectedAnswer === ''
                            ? styles.fillBlankAnswerBoxSkipped
                            : styles.fillBlankAnswerBoxWrong,
                        ]}
                      >
                        <Text style={styles.fillBlankAnswerText}>
                          {selectedAnswer === '' ? 'Skipped' : selectedAnswer}
                        </Text>
                      </View>
                    </Animated.View>
                  )}

                  {/* 正确答案框（仅在错误或跳过时显示） */}
                  {showFeedback && !isCorrect && (
                    <Animated.View
                      entering={FadeInDown.duration(300).delay(200)}
                      style={styles.fillBlankAnswerContainer}
                    >
                      <Text style={styles.fillBlankCorrectAnswerLabel}>Correct answer</Text>
                      <View style={[styles.fillBlankAnswerBox, styles.fillBlankAnswerBoxCorrect]}>
                        <Text style={styles.fillBlankAnswerText}>
                          {currentQuestion.correct_answer}
                        </Text>
                      </View>
                    </Animated.View>
                  )}
                </View>
              )}

                </View>

                {/* 提示文案区域（始终保留空间，防止布局跳动） */}
                <View style={styles.flipHintContainer}>
                  {showFeedback ? (
                    <Animated.Text
                      entering={FadeInDown.duration(300)}
                      style={styles.flipHintText}
                    >
                      {isCorrect ? "Tap to reveal answer" : "Tap to reveal explanation"}
                    </Animated.Text>
                  ) : (
                    <Text style={[styles.flipHintText, { opacity: 0 }]}>
                      {/* 占位文字，保持空间 */}
                      Tap to reveal explanation
                    </Text>
                  )}
                </View>
                  </View>
                </View>
              }
              backContent={
                <AnswerBackCard
                  correctAnswer={currentQuestion.correct_answer}
                  explanation={currentQuestion.explanation}
                  onFlipBack={handleFlipBack}
                  questionText={currentQuestion.question_text}
                />
              }
            />
          </ScrollView>

          {/* 填空题：固定在键盘上方的输入栏 */}
          {currentQuestion.question_type === 'fill_blank' && !showFeedback && (
            <View style={styles.fillBlankInputBarContainer}>
              <View style={styles.fillBlankInputBar}>
                <View style={styles.fillBlankInputWrapper}>
                  {!selectedAnswer.trim() ? (
                    <TouchableOpacity
                      style={styles.fillBlankPlaceholderContainer}
                      onPress={() => fillBlankInputRef.current?.focus()}
                      activeOpacity={1}
                    >
                      <Text style={styles.fillBlankPlaceholder}>Type the answer</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TextInput
                    ref={fillBlankInputRef}
                    style={[
                      styles.fillBlankInputBarInput,
                      !selectedAnswer.trim() && styles.fillBlankInputBarInputHidden,
                    ]}
                    value={selectedAnswer}
                    onChangeText={setSelectedAnswer}
                    placeholder=""
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    blurOnSubmit={false}
                  />
                </View>
                <View style={styles.fillBlankInputBarActions}>
                  {!selectedAnswer.trim() && (
                    <TouchableOpacity
                      style={styles.fillBlankDontKnowButton}
                      onPress={handleDontKnow}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.fillBlankDontKnowButtonText}>Don't Know</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.fillBlankSubmitButton,
                      !selectedAnswer.trim() && styles.fillBlankSubmitButtonDisabled,
                    ]}
                    onPress={() => {
                      if (selectedAnswer.trim()) {
                        handleCheckAnswer();
                      }
                    }}
                    activeOpacity={0.7}
                    disabled={!selectedAnswer.trim()}
                  >
                    <Feather
                      name="arrow-up"
                      size={18}
                      color={selectedAnswer.trim() ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 底部固定按钮 - 仅在答错时显示 */}
          {showFeedback && !isCorrect && (
            <SafeAreaView style={styles.footerContainer} edges={['bottom']}>
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.footerButton}
                  onPress={handleNext}
                  activeOpacity={0.8}
                >
                  <Text style={styles.footerButtonText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* 学习设置模态框 */}
      <StudySettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        settings={studySettings}
        onUpdateSettings={setStudySettings}
      />
    </LinearGradient>
  );

}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
    overflow: 'visible', // 确保子元素的圆角不被裁剪
  },
  container: {
    flex: 1,
    overflow: 'visible', // 确保子元素的圆角不被裁剪
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'space-between',
    overflow: 'visible', // 确保子元素的圆角不被裁剪
  },
  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(120, 116, 150, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: 0.4063,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  progressNumber: {
    fontSize: 12,
    fontWeight: '400',
    color: '#4A5565',
    lineHeight: 16,
  },
  progressBarBackground: {
    flex: 1,
    height: 12,
    backgroundColor: 'rgba(120, 116, 150, 0.08)',
    borderRadius: 20642200,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4E49FC',
    borderRadius: 20642200,
  },
  settingsButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ScrollView
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    // paddingBottom = 卡片与按钮的距离 (12px) + 按钮高度 (104px) + SafeArea (约20-34px) = 136-150px
    // 按钮高度：footer padding (16px) + footerButton minHeight (56px) + footerButton paddingVertical (32px) = 104px
    paddingBottom: 140, // 卡片与底部 Continue 按钮的距离为 12px
    alignItems: 'center',
    // 确保阴影不被裁剪
    overflow: 'visible',
  },
  scrollContentWithInputBar: {
    // 填空题未回答时：卡片底部距离输入框 12px
    // 输入框在 ScrollView 外面，不占用内容空间，所以 paddingBottom 只需要 12px
    paddingBottom: 12,
  },
  // Question Card
  questionCard: {
    flex: 1,
    // 卡片样式（背景、边框、阴影、padding）已经在 FlipCard 的 card 样式中设置
    // 这里只保留布局相关的样式
    width: '100%',
    alignSelf: 'stretch',
    gap: 12,
  },
  questionContent: {
    flex: 1,
    gap: 12,
    width: '100%',
  },
  questionTextContainer: {
    flex: 1,
    gap: 4,
    width: '100%',
    justifyContent: 'center',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '400',
    color: '#0A0A0A',
    lineHeight: 28,
    letterSpacing: -0.4492,
  },
  // Answer Container
  answerContainer: {
    width: '100%',
    flexShrink: 0,
  },
  // MCQ 容器
  mcqContainer: {
    width: '100%',
    gap: 8,
    flexShrink: 0,
  },
  chooseAnswerText: {
    fontSize: 14,
    color: '#6A7282',
    fontWeight: '500',
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 64,
    borderWidth: 0.62,
    borderColor: '#C6C7CB',
    justifyContent: 'center',
    marginBottom: 0,
  },
  optionText: {
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '400',
    lineHeight: 20,
  },
  optionButtonSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  optionTextSelected: {
    color: '#3B82F6',
  },
  optionButtonCorrect: {
    borderColor: '#00A63E',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    borderStyle: 'solid',
  },
  optionButtonCorrectDashed: {
    borderColor: '#00A63E',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    borderStyle: 'dashed',
  },
  optionTextCorrect: {
    color: '#0A0A0A',
    fontWeight: '400',
  },
  optionButtonWrong: {
    borderColor: '#FF6900',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    borderStyle: 'solid',
  },
  optionTextWrong: {
    color: '#0A0A0A',
    fontWeight: '400',
  },
  // True/False - 现在使用与 MCQ 相同的样式
  // Fill Blank - 固定在键盘上方的输入栏
  fillBlankInputBarContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(120, 116, 150, 0.08)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    // 确保圆角正确显示
    overflow: 'hidden',
  },
  fillBlankInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
  },
  fillBlankInputWrapper: {
    flex: 1,
    minHeight: 20,
    position: 'relative',
  },
  fillBlankPlaceholderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  fillBlankPlaceholder: {
    fontSize: 14,
    color: '#C6C7CB',
    lineHeight: 20,
    fontWeight: '400',
  },
  fillBlankInputBarInput: {
    fontSize: 14,
    color: '#0A0A0A',
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 20,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
    width: '100%',
  },
  fillBlankInputBarInputHidden: {
    position: 'absolute',
    opacity: 0,
    zIndex: 0,
  },
  fillBlankInputBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fillBlankDontKnowButton: {
    paddingVertical: 6,
  },
  fillBlankDontKnowButtonText: {
    fontSize: 14,
    color: '#4E49FC',
    fontWeight: '500',
    lineHeight: 20,
  },
  fillBlankSubmitButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#4E49FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillBlankSubmitButtonDisabled: {
    backgroundColor: 'rgba(78, 73, 252, 0.32)',
  },
  // Fill Blank Feedback
  fillBlankFeedbackContainer: {
    gap: 8,
    width: '100%',
  },
  fillBlankFeedbackText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  fillBlankFeedbackTextCorrect: {
    color: '#00A63E',
  },
  fillBlankFeedbackTextWrong: {
    color: '#FF6900',
  },
  fillBlankFeedbackTextSkipped: {
    color: '#6A7282',
  },
  fillBlankAnswerContainer: {
    gap: 8,
    width: '100%',
  },
  fillBlankAnswerBox: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  fillBlankAnswerBoxCorrect: {
    borderColor: '#00A63E',
    borderStyle: 'solid',
  },
  fillBlankAnswerBoxWrong: {
    borderColor: '#FF6900',
    borderStyle: 'solid',
  },
  fillBlankAnswerBoxSkipped: {
    borderColor: '#6A7282',
    borderStyle: 'solid',
  },
  fillBlankAnswerText: {
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '400',
    lineHeight: 20,
  },
  fillBlankCorrectAnswerLabel: {
    fontSize: 14,
    color: '#00A63E',
    fontWeight: '500',
    lineHeight: 20,
  },
  correctAnswerHint: {
    marginTop: 16,
  },
  correctAnswerHintLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 8,
  },
  correctAnswerBox: {
    borderWidth: 2,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#F0FDF4',
  },
  correctAnswerText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
  // Feedback
  feedbackContainer: {
    gap: 8,
    width: '100%',
  },
  flipHintContainer: {
    alignItems: 'center',
    minHeight: 20, // 固定最小高度，防止布局跳动
  },
  flipHintText: {
    fontSize: 12,
    color: '#6A7282',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 16,
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  feedbackTextCorrect: {
    color: '#00A63E',
  },
  feedbackTextWrong: {
    color: '#FF6900',
  },
  explanationToggle: {
    marginTop: 8,
  },
  explanationToggleText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
    marginTop: 8,
  },
  // Footer
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footer: {
    padding: 16,
  },
  footerButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  footerButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  // Loading & Error States
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
  // Caught Up State
  caughtUpContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
  caughtUpIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  caughtUpTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  caughtUpSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  reviewAllButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
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
  reviewAllButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  backButtonCaughtUp: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  backButtonCaughtUpText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  // Summary
  summaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  summaryContent: {
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginTop: 24,
    marginBottom: 16,
  },
  summaryScore: {
    fontSize: 48,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 8,
  },
  summaryPercentage: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 32,
  },
  summaryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  summaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

