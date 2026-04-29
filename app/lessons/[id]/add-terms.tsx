import BackIcon from '@/components/icons/BackIcon';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import { strFromU8, unzipSync } from 'fflate';
import React, { useCallback, useEffect, useState } from 'react';
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

interface TermRow {
  id: string;
  term: string;
  definition: string;
  explanation: string;
}

type TabType = 'input-edit' | 'ai-topic' | 'upload-pdf';

interface Lesson {
  id: string;
  is_vocab_mode?: boolean;
}

export default function AddTermsScreen() {
  const { id, fromCreate, termId } = useLocalSearchParams<{ id: string; fromCreate?: string; termId?: string }>();
  const navigation = useNavigation();
  const { isPro, showPaywall } = useSubscription();
  
  // Lesson 相关状态
  const [lesson, setLesson] = useState<Lesson | null>(null);
  
  // Terms 相关状态
  const [activeTab, setActiveTab] = useState<TabType>('input-edit');
  const [termsList, setTermsList] = useState<TermRow[]>([
    { id: '1', term: '', definition: '', explanation: '' },
  ]);
  const [nextId, setNextId] = useState(2);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // 标记是否处于编辑模式
  const [editingTermId, setEditingTermId] = useState<string | null>(null); // 正在编辑的 term 的数据库 ID
  
  // AI Topic 状态
  const [aiTopic, setAiTopic] = useState('');
  const [generatingTopic, setGeneratingTopic] = useState(false);
  
  // Input & Edit 状态（合并了 Paste Text 功能）
  const [smartInputText, setSmartInputText] = useState('');
  const [extractingText, setExtractingText] = useState(false);
  
  // Upload PDF 状态
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerResult | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'uploading' | 'parsing' | 'extracting'>('idle');
  const [pdfElapsed, setPdfElapsed] = useState(0);
  
  // AI 使用次数限制（未订阅用户）
  const FREE_TIER_AI_TOPIC_LIMIT = 3;
  const FREE_TIER_PDF_UPLOAD_LIMIT = 3; // 总共3次，不是每天
  const [aiTopicCount, setAiTopicCount] = useState(0);
  const [pdfUploadCount, setPdfUploadCount] = useState(0);

  // Skip 按钮逻辑（仅当 fromCreate=true 时显示）
  const handleSkip = useCallback(() => {
    if (id && !loading) {
      router.replace(`/lessons/${id}` as any);
    }
  }, [id, loading]);

  // 保存所有词条
  const handleSave = useCallback(async () => {
    if (!id) {
      Alert.alert('Error', 'Lesson ID is required');
      return;
    }

    if (loading) {
      return; // 防止重复点击
    }

    // 验证所有行
    const validTerms = termsList.filter((t) => t.term.trim() && t.definition.trim());
    if (validTerms.length === 0) {
      Alert.alert('Error', 'Please fill in at least one Term and Definition');
      return;
    }

    setLoading(true);
    try {
      // 如果是编辑模式，更新现有 term
      if (isEditing && editingTermId) {
        const termToUpdate = validTerms[0]; // 编辑模式下只有一个 term
        
        const { error: updateError, data: updatedTerm } = await supabase
          .from('terms')
          .update({
            term: termToUpdate.term.trim(),
            definition: termToUpdate.definition.trim(),
            explanation: termToUpdate.explanation.trim() || null,
          })
          .eq('id', editingTermId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating term:', updateError);
          Alert.alert('Error', `Failed to update term: ${updateError.message}`);
          setLoading(false);
          return;
        }

        if (!updatedTerm) {
          console.error('No term was updated');
          setLoading(false);
          router.replace(`/lessons/${id}` as any);
          return;
        }

        // 编辑模式下，跳转到课程详情页
        router.replace(`/lessons/${id}` as any);
        return;
      }

      // 新增模式：构建插入数据并插入到 Supabase
      const insertData = validTerms.map((t) => ({
        lesson_id: id,
        term: t.term.trim(),
        definition: t.definition.trim(),
        explanation: t.explanation.trim() || null,
      }));

      const { error, data: insertedTerms } = await supabase
        .from('terms')
        .insert(insertData)
        .select();

      if (error) {
        console.error('Error saving terms:', error);
        Alert.alert('Error', `Failed to save terms: ${error.message}`);
        setLoading(false);
        return;
      }

      // 获取插入成功后的 terms 数据（包含 id）
      if (!insertedTerms || insertedTerms.length === 0) {
        console.error('No terms were inserted');
        setLoading(false);
        router.replace(`/lessons/${id}` as any);
        return;
      }

      // 自动触发题目生成
      try {
        // 根据 is_vocab_mode 动态选择 API 和构建请求数据
        const questionFunctionName = lesson?.is_vocab_mode ? 'generate-vocab-questions' : 'generate-questions';
        
        // vocab-questions 需要包含 explanation 字段，普通 questions 不需要
        const termsForGeneration = lesson?.is_vocab_mode
          ? insertedTerms.map((term) => ({
              id: term.id,
              term: term.term,
              definition: term.definition,
              explanation: term.explanation || undefined, // vocab-questions 支持 explanation
            }))
          : insertedTerms.map((term) => ({
              id: term.id,
              term: term.term,
              definition: term.definition,
            }));

        const { error: generateError } = await supabase.functions.invoke(questionFunctionName, {
          body: {
            lessonId: id,
            terms: termsForGeneration,
          },
        });

        if (generateError) {
          // AI 生成失败不影响流程，只记录错误
          console.error(`Error generating questions (non-blocking):`, generateError);
          // 不显示错误提示给用户，因为可以在详情页手动重新生成
        } else {
          console.log('Questions generated successfully');
        }
      } catch (generateErr) {
        // 捕获生成题目的错误，但不阻断流程
        console.error('Error generating questions (non-blocking):', generateErr);
      }

      // 跳转到课程详情页
      router.replace(`/lessons/${id}` as any);
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
      setLoading(false);
    }
  }, [id, termsList, loading, isEditing, editingTermId, lesson]);

  // 隐藏系统导航栏
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
      header: () => null,
    });
  }, [navigation]);

  // 加载 AI 使用次数（未订阅用户）
  const loadUsageCounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const aiTopicKey = `@ai_topic_count_${user.id}`;
      const pdfUploadKey = `@pdf_upload_count_${user.id}`;
      
      const [aiTopicCountStr, pdfUploadCountStr] = await Promise.all([
        AsyncStorage.getItem(aiTopicKey),
        AsyncStorage.getItem(pdfUploadKey),
      ]);
      
      setAiTopicCount(aiTopicCountStr ? parseInt(aiTopicCountStr, 10) : 0);
      setPdfUploadCount(pdfUploadCountStr ? parseInt(pdfUploadCountStr, 10) : 0);
    } catch (error) {
      console.error('Error loading usage counts:', error);
    }
  };

  // 保存 AI Topic 使用次数
  const saveAiTopicCount = async (count: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const aiTopicKey = `@ai_topic_count_${user.id}`;
      await AsyncStorage.setItem(aiTopicKey, count.toString());
      setAiTopicCount(count);
    } catch (error) {
      console.error('Error saving AI topic count:', error);
    }
  };

  // 保存 PDF Upload 使用次数
  const savePdfUploadCount = async (count: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const pdfUploadKey = `@pdf_upload_count_${user.id}`;
      await AsyncStorage.setItem(pdfUploadKey, count.toString());
      setPdfUploadCount(count);
    } catch (error) {
      console.error('Error saving PDF upload count:', error);
    }
  };

  // 获取课程信息（包括 is_vocab_mode）
  useEffect(() => {
    const fetchLesson = async () => {
      if (!id) {
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return;
        }

        const { data: lessonData, error: lessonError } = await supabase
          .from('lessons')
          .select('id, is_vocab_mode')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (lessonError) {
          console.error('Error fetching lesson:', lessonError);
          return;
        }

        if (lessonData) {
          setLesson(lessonData);
        }
      } catch (err) {
        console.error('Error fetching lesson:', err);
      }
    };

    fetchLesson();
    // 如果不是 Pro 用户，加载使用次数
    if (!isPro) {
      loadUsageCounts();
    }
  }, [id, isPro]);

  // 加载要编辑的 term 数据
  useEffect(() => {
    const loadTermForEdit = async () => {
      if (!termId || !id) {
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return;
        }

        // 查询要编辑的 term
        const { data: termData, error: termError } = await supabase
          .from('terms')
          .select('*')
          .eq('id', termId)
          .eq('lesson_id', id)
          .single();

        if (termError) {
          console.error('Error fetching term for edit:', termError);
          Alert.alert('Error', 'Failed to load term for editing');
          return;
        }

        if (termData) {
          // 设置编辑模式
          setIsEditing(true);
          setEditingTermId(termId);
          
          // 将 term 数据填充到表单中
          setTermsList([
            {
              id: '1', // 使用本地 ID
              term: termData.term || '',
              definition: termData.definition || '',
              explanation: termData.explanation || '',
            },
          ]);
          setNextId(2);
        }
      } catch (err) {
        console.error('Error loading term for edit:', err);
        Alert.alert('Error', 'Failed to load term for editing');
      }
    };

    loadTermForEdit();
  }, [termId, id]);

  // PDF 解析计时器
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (uploadingPdf && pdfStatus !== 'idle') {
      timer = setInterval(() => {
        setPdfElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setPdfElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [uploadingPdf, pdfStatus]);

  // 返回按钮
  const handleGoBack = () => {
    router.back();
  };


  // 添加新行（手动录入）
  const handleAddRow = () => {
    const newId = nextId.toString();
    setTermsList([...termsList, { id: newId, term: '', definition: '', explanation: '' }]);
    setNextId(nextId + 1);
  };

  // 删除行
  const handleDeleteRow = (rowId: string) => {
    if (termsList.length === 1) {
      Alert.alert('Error', 'At least one row is required');
      return;
    }
    setTermsList(termsList.filter((term) => term.id !== rowId));
  };

  // 更新行数据
  const handleUpdateTerm = (rowId: string, field: 'term' | 'definition' | 'explanation', value: string) => {
    setTermsList(
      termsList.map((term) => (term.id === rowId ? { ...term, [field]: value } : term))
    );
  };

  // AI Topic 生成
  const handleGenerateFromTopic = async () => {
    if (!aiTopic.trim()) {
      Alert.alert('Error', 'Please enter a topic');
      return;
    }

    // 检查订阅状态和使用次数限制
    if (!isPro) {
      if (aiTopicCount >= FREE_TIER_AI_TOPIC_LIMIT) {
        Alert.alert(
          'Upgrade to Pro',
          `You've used ${FREE_TIER_AI_TOPIC_LIMIT} free AI Topic generations. Upgrade to Pro for unlimited AI features!`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Upgrade Now',
              onPress: async () => {
                await showPaywall();
              },
            },
          ]
        );
        return;
      }
    }

    setGeneratingTopic(true);
    try {
      // 如果不是 Pro 用户，增加使用次数
      if (!isPro) {
        const newCount = aiTopicCount + 1;
        await saveAiTopicCount(newCount);
      }
      // 根据 is_vocab_mode 动态选择 API
      const functionName = lesson?.is_vocab_mode ? 'generate-vocab-terms' : 'generate-terms';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          type: 'topic',
          content: aiTopic.trim(),
        },
      });

      if (error) {
        console.error('Error generating terms:', error);
        // 尝试从 error 对象中提取更详细的错误信息
        let errorMessage = 'Failed to generate terms';
        if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          // 检查是否有其他错误信息
          const errorObj = error as any;
          if (errorObj.error) {
            errorMessage = errorObj.error;
          } else if (errorObj.message) {
            errorMessage = errorObj.message;
          }
        }
        // 如果函数可能未部署，提供更友好的提示
        if (errorMessage.includes('not found') || errorMessage.includes('404')) {
          errorMessage = `Function "${functionName}" may not be deployed. Please deploy it using: supabase functions deploy ${functionName}`;
        }
        throw new Error(errorMessage);
      }

      if (data && data.success && data.results) {
        // 将生成的结果追加到 termsList
        let currentNextId = nextId;
        const newTerms: TermRow[] = data.results.map((item: { term: string; definition: string; explanation?: string }) => {
          const termId = currentNextId.toString();
          currentNextId++;
          return {
            id: termId,
            term: item.term,
            definition: removeMarkdown(item.definition), // 去除 Markdown 格式
            explanation: item.explanation ? removeMarkdown(item.explanation) : '', // 去除 Markdown 格式
          };
        });

        setTermsList([...termsList, ...newTerms]);
        setNextId(currentNextId);
        setAiTopic(''); // 清空输入框
        setActiveTab('input-edit'); // 切换到 Input & Edit 标签查看结果
        Alert.alert('Success', `Generated ${data.results.length} terms!`);
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (err) {
      console.error('Error:', err);
      // 如果生成失败，回退使用次数（未订阅用户）
      if (!isPro && aiTopicCount > 0) {
        const newCount = aiTopicCount - 1;
        await saveAiTopicCount(newCount);
      }
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
    } finally {
      setGeneratingTopic(false);
    }
  };

  // 去除 Markdown 格式的辅助函数
  const removeMarkdown = (text: string): string => {
    if (!text) return text;
    
    let result = text;
    let previousResult = '';
    let iterations = 0;
    const maxIterations = 10; // 防止无限循环
    
    // 循环处理直到没有变化（处理嵌套的 Markdown）
    while (result !== previousResult && iterations < maxIterations) {
      previousResult = result;
      iterations++;
      
      // 先处理代码块（避免代码块内的内容被误处理）
      result = result.replace(/```[\s\S]*?```/g, '');
      result = result.replace(/`([^`]+)`/g, '$1');
      
      // 处理链接和图片（先处理，避免链接内的文本被误处理）
      result = result.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
      result = result.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
      
      // 处理粗体（**text** 或 __text__）- 需要先处理双星号，避免与单星号冲突
      result = result.replace(/\*\*([^*]+?)\*\*/g, '$1');
      result = result.replace(/__([^_]+?)__/g, '$1');
      
      // 处理删除线
      result = result.replace(/~~([^~]+?)~~/g, '$1');
      
      // 处理斜体（*text* 或 _text_）
      // 匹配单个星号或下划线，但确保不是粗体的一部分
      // 简单方法：匹配不在双星号之间的单星号
      result = result.replace(/\*([^*\n]+?)\*/g, '$1');
      result = result.replace(/_([^_\n]+?)_/g, '$1');
      
      // 处理标题标记
      result = result.replace(/^#{1,6}\s+/gm, '');
      
      // 处理引用标记
      result = result.replace(/^>\s+/gm, '');
      
      // 处理列表标记
      result = result.replace(/^[\s]*[-*+]\s+/gm, '');
      result = result.replace(/^\d+\.\s+/gm, '');
      
      // 处理 HTML 标签（如果 AI 返回了 HTML）
      result = result.replace(/<[^>]+>/g, '');
    }
    
    // 清理多余的空格和换行
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/[ \t]+/g, ' '); // 多个空格合并为一个
    result = result.trim();
    
    return result;
  };

  // Auto-Detect 提取（合并了 Paste Text 功能）
  const handleAutoDetect = async () => {
    if (!smartInputText.trim()) {
      Alert.alert('Error', 'Please paste or type some text');
      return;
    }

    setExtractingText(true);
    try {
      // 根据 is_vocab_mode 动态选择 API
      const functionName = lesson?.is_vocab_mode ? 'generate-vocab-terms' : 'generate-terms';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          type: 'text',
          content: smartInputText.trim(),
        },
      });

      if (error) {
        console.error('Error extracting terms:', error);
        throw new Error(error.message || 'Failed to extract terms');
      }

      if (data && data.success && data.results) {
        // 将提取的结果追加到 termsList
        let currentNextId = nextId;
        const newTerms: TermRow[] = data.results.map((item: { term: string; definition: string; explanation?: string }) => {
          const termId = currentNextId.toString();
          currentNextId++;
          return {
            id: termId,
            term: item.term,
            definition: removeMarkdown(item.definition), // 去除 Markdown 格式
            explanation: item.explanation ? removeMarkdown(item.explanation) : '', // 去除 Markdown 格式
          };
        });

        // 如果当前只有一行且是默认空行，则用新结果替换它；否则在末尾追加
        setTermsList((prev) => {
          const shouldReplaceFirstEmpty =
            prev.length === 1 &&
            !prev[0].term.trim() &&
            !prev[0].definition.trim() &&
            !prev[0].explanation.trim();
          const base = shouldReplaceFirstEmpty ? [] : prev;
          return [...base, ...newTerms];
        });
        setNextId(currentNextId);
        setSmartInputText(''); // 清空输入框
        Alert.alert('Success', `Extracted ${data.results.length} terms!`);
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
    } finally {
      setExtractingText(false);
    }
  };

  // PDF 文件选择
  const handleSelectPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result);
      }
    } catch (err) {
      console.error('Error selecting PDF:', err);
      Alert.alert('Error', 'Failed to select PDF file');
    }
  };

  // PDF 上传和处理（方案 A：前端直接调用 MinerU API + generate-terms）
  const handleUploadAndProcess = async () => {
    if (!selectedFile || selectedFile.canceled || !selectedFile.assets || selectedFile.assets.length === 0) {
      Alert.alert('Error', 'Please select a PDF file first');
      return;
    }

    // 检查订阅状态和使用次数限制
    if (!isPro) {
      if (pdfUploadCount >= FREE_TIER_PDF_UPLOAD_LIMIT) {
        Alert.alert(
          'Upgrade to Pro',
          `You've used all ${FREE_TIER_PDF_UPLOAD_LIMIT} free PDF uploads. Upgrade to Pro for unlimited PDF processing!`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Upgrade Now',
              onPress: async () => {
                await showPaywall();
              },
            },
          ]
        );
        return;
      }
    }

    const asset = selectedFile.assets[0];
    setUploadingPdf(true);
    setPdfStatus('uploading');

    // 如果不是 Pro 用户，增加使用次数
    if (!isPro) {
      const newCount = pdfUploadCount + 1;
      await savePdfUploadCount(newCount);
    }

    try {
      // 获取当前用户（用于构造文件路径）
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Authentication Required', 'Please sign in again to continue.');
        router.replace('/login');
        setUploadingPdf(false);
        return;
      }

      // 第一步：上传 PDF 到 Supabase Storage（用于生成 URL 提供给 MinerU）
      if (!asset.uri) {
        throw new Error('Selected PDF has no valid URI.');
      }

      // 简单的本地大小检查，避免 0 字节文件上传
      if (!asset.size || asset.size === 0) {
        throw new Error('Selected PDF file is empty (0 bytes). Please choose another file.');
      }

      console.log('Selected PDF asset ===>', {
        uri: asset.uri,
        size: asset.size,
        name: asset.name,
        mimeType: asset.mimeType,
      });

      const fileName = `${user.id}/${Date.now()}_${asset.name || 'document.pdf'}`;

      // 使用 expo-file-system 将本地 PDF 读取为 base64，然后转换为二进制上传
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: 'base64',
      });

      if (!base64Data || base64Data.length === 0) {
        throw new Error('Failed to read PDF file from local storage.');
      }

      // 将 base64 字符串转换为 Uint8Array（二进制）
      const byteCharacters = global.atob ? global.atob(base64Data) : atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, byteArray, {
          contentType: asset.mimeType || 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('Error uploading PDF to storage:', uploadError);
        throw new Error(`Failed to upload PDF: ${uploadError.message}`);
      }

      // 第二步：获取公开 URL
      const { data: urlData } = supabase.storage
        .from('pdfs')
        .getPublicUrl(fileName);

      const pdfUrl = urlData.publicUrl;
      if (!pdfUrl) {
        throw new Error('Failed to get public URL for PDF');
      }

      // 第三步：调用 MinerU API 创建任务，并轮询获取解析结果
      setPdfStatus('parsing');

      // 直接在这里配置 MinerU 的 API Token
      // TODO: 将下面的 Token 换成你自己的 MinerU Token（目前已经粘贴了一份）
      const MINERU_API_TOKEN =
        'eyJ0eXBlIjoiSldUIiwiYWxnIjoiSFM1MTIifQ.eyJqdGkiOiI1MTkwMDgyNCIsInJvbCI6IlJPTEVfUkVHSVNURVIiLCJpc3MiOiJPcGVuWExhYiIsImlhdCI6MTc2NTc5Mzc3NywiY2xpZW50SWQiOiJsa3pkeDU3bnZ5MjJqa3BxOXgydyIsInBob25lIjoiIiwib3BlbklkIjpudWxsLCJ1dWlkIjoiM2JkZWNjZTctMDQxOS00YzI5LWEwZTMtZjZlMTI3NDljMzM3IiwiZW1haWwiOiJmbHlza3l0b29Ab3V0bG9vay5jb20iLCJleHAiOjE3NjcwMDMzNzd9.CRiwzPgAA_1P3yVDQpJ8p1r6H33F00PHloN-_gnp0vPK3wG4vM-OtCMdNlkV6UnrGKX8NGuNENuFpLxWfot22A';

      if (!MINERU_API_TOKEN) {
        throw new Error(
          'MinerU API token is not configured. Please open add-terms.tsx and set MINERU_API_TOKEN.'
        );
      }

      // 3.1 创建 MinerU 解析任务
      const createTaskResponse = await fetch('https://mineru.net/api/v4/extract/task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${MINERU_API_TOKEN}`,
        },
        body: JSON.stringify({
          url: pdfUrl,
          model_version: 'vlm',
        }),
      });

      if (!createTaskResponse.ok) {
        const errorText = await createTaskResponse.text();
        console.error('MinerU create task error:', errorText);
        throw new Error('MinerU API failed to create task: ' + errorText);
      }

      const taskData: any = await createTaskResponse.json();
      const taskId: string | undefined =
        taskData.task_id || taskData.id || taskData.data?.task_id;

      if (!taskId) {
        console.error('MinerU unexpected create-task response:', taskData);
        throw new Error('MinerU did not return a valid task_id.');
      }

      // 3.2 轮询任务状态，直到完成或超时（最大 ~60 秒），并在完成后下载 ZIP 结果提取文本
      let extractedText: string | null = null;
      const maxAttempts = 30;
      const pollInterval = 2000;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        const statusResponse = await fetch(
          `https://mineru.net/api/v4/extract/task/${taskId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${MINERU_API_TOKEN}`,
            },
          }
        );

        if (!statusResponse.ok) {
          const statusText = await statusResponse.text();
          console.error(
            `MinerU status error (attempt ${attempt + 1}):`,
            statusText
          );
          // 最后一轮仍然失败，直接抛错
          if (attempt === maxAttempts - 1) {
            throw new Error('MinerU status check failed: ' + statusText);
          }
          continue;
        }

        const statusData: any = await statusResponse.json();
        const dataNode = statusData.data || statusData;
        const rawStatus =
          dataNode.status || dataNode.state || statusData.status || statusData.state;
        const status =
          typeof rawStatus === 'string' ? rawStatus.toLowerCase() : undefined;

        console.log(
          `MinerU task status (attempt ${attempt + 1}):`,
          status,
          'raw:',
          statusData
        );

        if (
          status === 'succeed' ||
          status === 'success' ||
          status === 'completed' ||
          status === 'done'
        ) {
          // 优先使用 MinerU 直接给出的文本字段
          if (dataNode.markdown || dataNode.text || dataNode.content) {
            extractedText =
              dataNode.markdown || dataNode.text || dataNode.content || null;
            break;
          }

          // 如果返回的是 ZIP 压缩包链接（full_zip_url），下载并解压，提取其中的 .md 或 .txt 文件内容
          if (dataNode.full_zip_url) {
            try {
              const zipResp = await fetch(dataNode.full_zip_url);
              if (!zipResp.ok) {
                const zipText = await zipResp.text();
                console.error('Failed to download MinerU ZIP:', zipText);
                throw new Error('Failed to download MinerU ZIP.');
              }
              const zipArrayBuffer = await zipResp.arrayBuffer();
              const zipUint8 = new Uint8Array(zipArrayBuffer);
              const files = unzipSync(zipUint8);
              const fileNames = Object.keys(files);

              // 优先选择 .md 或 .txt 文件
              const preferredName =
                fileNames.find((n) => n.toLowerCase().endsWith('.md')) ||
                fileNames.find((n) => n.toLowerCase().endsWith('.txt')) ||
                fileNames[0];

              if (preferredName) {
                const fileData = files[preferredName];
                extractedText = strFromU8(fileData);
              }
            } catch (zipErr) {
              console.error('Error extracting text from MinerU ZIP:', zipErr);
              if (!extractedText) {
                throw new Error('Failed to extract text from MinerU ZIP result.');
              }
            }
          }

          break;
        }

        if (status === 'failed' || status === 'error') {
          const msg =
            dataNode.message ||
            dataNode.error ||
            dataNode.err_msg ||
            statusData.message ||
            statusData.error ||
            'Unknown MinerU error';
          throw new Error('MinerU task failed: ' + msg);
        }

        // 其他状态（如 pending/processing/running）继续轮询
      }

      if (!extractedText || !extractedText.trim()) {
        throw new Error(
          'MinerU did not return any text content from PDF (task may not have completed).'
        );
      }

      // 为避免 generate-terms 的 OpenAI token 超长，做长度截断（与后端一致）
      const MAX_TEXT_LENGTH = 15000;
      const originalLength = extractedText.length;
      if (originalLength > MAX_TEXT_LENGTH) {
        console.log(
          `MinerU extracted text too long (${originalLength}), truncating to ${MAX_TEXT_LENGTH}`
        );
        extractedText = extractedText.slice(0, MAX_TEXT_LENGTH) + '...';
      }

      // 第四步：调用 generate-terms 或 generate-vocab-terms（type: 'text'），从文本中提取 Terms
      setPdfStatus('extracting');

      // 根据 is_vocab_mode 动态选择 API
      const functionName = lesson?.is_vocab_mode ? 'generate-vocab-terms' : 'generate-terms';

      const { data: termsData, error: termsError } = await supabase.functions.invoke(
        functionName,
        {
          body: {
            type: 'text',
            content: extractedText,
          },
        }
      );

      if (termsError) {
        console.error(`Error calling ${functionName}:`, termsError);
        // 针对 400 / 无法提取术语的情况，给用户友好提示而不是直接抛错
        Alert.alert(
          'No Terms Extracted',
          'AI could not extract any valid terms from this PDF. Please try another file or paste text manually.'
        );
        return;
      }

      if (termsData && termsData.success && termsData.results) {
        let currentNextId = nextId;
        const newTerms: TermRow[] = termsData.results.map(
          (item: { term: string; definition: string; explanation?: string }) => {
            const termId = currentNextId.toString();
            currentNextId++;
            return {
              id: termId,
              term: item.term,
              definition: removeMarkdown(item.definition), // 去除 Markdown 格式
              explanation: item.explanation ? removeMarkdown(item.explanation) : '', // 去除 Markdown 格式
            };
          }
        );

        // 如果当前只有一行且是默认空行，则用新结果替换它；否则在末尾追加
        setTermsList((prev) => {
          const shouldReplaceFirstEmpty =
            prev.length === 1 &&
            !prev[0].term.trim() &&
            !prev[0].definition.trim() &&
            !prev[0].explanation.trim();
          const base = shouldReplaceFirstEmpty ? [] : prev;
          return [...base, ...newTerms];
        });
        setNextId(currentNextId);
        setSelectedFile(null); // 清空选中的文件
        setActiveTab('input-edit'); // 切换到 Input & Edit 标签查看结果
        Alert.alert('Success', `Extracted ${termsData.results.length} terms from PDF!`);
      } else {
        throw new Error('Unexpected response from generate-terms');
      }
    } catch (err) {
      console.error('Error:', err);
      // 如果上传失败，回退使用次数（未订阅用户）
      if (!isPro && pdfUploadCount > 0) {
        const newCount = pdfUploadCount - 1;
        await savePdfUploadCount(newCount);
      }
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', errorMessage);
    } finally {
      setUploadingPdf(false);
      setPdfStatus('idle');
    }
  };

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Lesson ID is required</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 获取有效的 terms（用于预览）
  const validTerms = termsList.filter((t) => t.term.trim() && t.definition.trim());

  const isFromCreate = fromCreate === 'true';

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
          {/* 自定义 Header */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                onPress={handleGoBack}
                style={styles.backButtonHeader}
                activeOpacity={0.7}
              >
                <BackIcon size={20} color="#0A0A0A" />
              </TouchableOpacity>
              <View style={styles.headerRightContainer}>
                {isFromCreate && (
                  <TouchableOpacity
                    onPress={handleSkip}
                    style={styles.skipButton}
                    activeOpacity={0.7}
                    disabled={loading}
                  >
                    <Text style={[styles.skipButtonText, loading && styles.skipButtonTextDisabled]}>
                      Skip
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSave}
                  style={styles.saveButton}
                  activeOpacity={0.7}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 8 }} />
                      <Text style={styles.saveButtonText}>Generating Quiz...</Text>
                    </>
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.headerTitle}>
              {isFromCreate ? 'Step 2: Add Terms' : isEditing ? 'Edit Term' : 'Add Terms'}
            </Text>
          </View>

          {/* Tab 导航 - 编辑模式下隐藏 */}
          {!isEditing && (
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'input-edit' && styles.tabActive]}
              onPress={() => setActiveTab('input-edit')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'input-edit' && styles.tabTextActive]}>
                Input & Edit
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'ai-topic' && styles.tabActive]}
              onPress={() => setActiveTab('ai-topic')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'ai-topic' && styles.tabTextActive]}>
                AI Topic
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'upload-pdf' && styles.tabActive]}
              onPress={() => setActiveTab('upload-pdf')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'upload-pdf' && styles.tabTextActive]}>
                Upload PDF
              </Text>
            </TouchableOpacity>
          </View>
          )}

          {/* Tab 内容 */}
          <View style={styles.tabContent}>
            {/* Input & Edit 面板（合并了 Manual 和 Paste Text） */}
            {(activeTab === 'input-edit' || isEditing) && (
              <View>
                {/* 顶部区域：Smart Input - 编辑模式下隐藏 */}
                {!isEditing && (
                <View style={styles.smartInputSection}>
                  <Text style={styles.smartInputLabel}>
                    Paste text here to auto-extract terms, or type manually below...
                  </Text>
                  <TextInput
                    style={[styles.smartInput, styles.smartTextarea]}
                    placeholder="Paste text here to auto-extract terms, or type manually below..."
                    placeholderTextColor="#9CA3AF"
                    value={smartInputText}
                    onChangeText={setSmartInputText}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    editable={!extractingText && !loading}
                  />
                  <TouchableOpacity
                    style={[styles.autoDetectButton, extractingText && styles.autoDetectButtonDisabled]}
                    onPress={handleAutoDetect}
                    disabled={extractingText || loading}
                    activeOpacity={0.8}
                  >
                    {extractingText ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.autoDetectButtonText}>Detecting...</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.autoDetectButtonText}>✨</Text>
                        <Text style={styles.autoDetectButtonText}>Auto-Detect</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                )}

                {/* 下部区域：Editor List */}
                <View style={styles.editorListSection}>
                  <Text style={styles.editorListTitle}>{isEditing ? 'Edit Term' : 'Terms List'}</Text>
                  <View style={styles.termsListContainer}>
                    {termsList.map((termRow, index) => (
                      <View key={termRow.id} style={styles.termRow}>
                        {/* 编辑模式下隐藏 header */}
                        {!isEditing && (
                        <View style={styles.termRowHeader}>
                          <Text style={styles.termRowNumber}>#{index + 1}</Text>
                          <TouchableOpacity
                            onPress={() => handleDeleteRow(termRow.id)}
                            style={styles.deleteRowButton}
                            activeOpacity={0.7}
                          >
                            <Feather name="x" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                        )}
                        <View style={styles.termInputGroup}>
                          <Text style={styles.termLabel}>Term</Text>
                          <TextInput
                            style={styles.termInput}
                            placeholder="e.g., Ambition"
                            placeholderTextColor="#9CA3AF"
                            value={termRow.term}
                            onChangeText={(text) => handleUpdateTerm(termRow.id, 'term', text)}
                            editable={!loading}
                          />
                        </View>
                        <View style={styles.termInputGroup}>
                          <Text style={styles.termLabel}>Definition</Text>
                          <TextInput
                            style={[styles.termInput, styles.termTextarea]}
                            placeholder="e.g., A strong desire to achieve something"
                            placeholderTextColor="#9CA3AF"
                            value={termRow.definition}
                            onChangeText={(text) => handleUpdateTerm(termRow.id, 'definition', text)}
                            multiline
                            numberOfLines={2}
                            textAlignVertical="top"
                            editable={!loading}
                          />
                        </View>
                        <View style={styles.termInputGroup}>
                          <Text style={styles.termLabel}>Explanation (Optional)</Text>
                          <TextInput
                            style={[styles.termInput, styles.termTextarea]}
                            placeholder="Enter explanation (optional)"
                            placeholderTextColor="#9CA3AF"
                            value={termRow.explanation}
                            onChangeText={(text) => handleUpdateTerm(termRow.id, 'explanation', text)}
                            multiline
                            numberOfLines={2}
                            textAlignVertical="top"
                            editable={!loading}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                  {/* 编辑模式下隐藏 Add Row 按钮 */}
                  {!isEditing && (
                  <TouchableOpacity
                    style={styles.addRowButton}
                    onPress={handleAddRow}
                    activeOpacity={0.8}
                    disabled={loading}
                  >
                    <Feather name="plus" size={20} color="#6366F1" />
                    <Text style={styles.addRowButtonText}>Add Row</Text>
                  </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* AI Topic 面板 - 编辑模式下隐藏 */}
            {!isEditing && activeTab === 'ai-topic' && (
              <View>
                {/* 使用次数提示（未订阅用户） */}
                {!isPro && (
                  <View style={styles.usageLimitBanner}>
                    <Feather name="info" size={16} color="#6366F1" />
                    <Text style={styles.usageLimitText}>
                      {aiTopicCount >= FREE_TIER_AI_TOPIC_LIMIT 
                        ? 'Free AI Topic generations used up. Upgrade to Pro!'
                        : `${FREE_TIER_AI_TOPIC_LIMIT - aiTopicCount} free AI Topic generations remaining`}
                    </Text>
                    {aiTopicCount >= FREE_TIER_AI_TOPIC_LIMIT && (
                      <TouchableOpacity
                        style={styles.upgradeButtonSmall}
                        onPress={async () => {
                          await showPaywall();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.upgradeButtonSmallText}>Upgrade</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View style={styles.aiInputGroup}>
                  <Text style={styles.aiLabel}>
                    Enter a topic (e.g., Roman History, React Hooks)
                  </Text>
                  <TextInput
                    style={styles.aiInput}
                    placeholder="Quantum Physics"
                    placeholderTextColor="#9CA3AF"
                    value={aiTopic}
                    onChangeText={setAiTopic}
                    editable={!generatingTopic && !loading && (isPro || aiTopicCount < FREE_TIER_AI_TOPIC_LIMIT)}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.aiButton, 
                    (generatingTopic || loading || (!isPro && aiTopicCount >= FREE_TIER_AI_TOPIC_LIMIT)) && styles.aiButtonDisabled
                  ]}
                  onPress={handleGenerateFromTopic}
                  disabled={generatingTopic || loading || (!isPro && aiTopicCount >= FREE_TIER_AI_TOPIC_LIMIT)}
                  activeOpacity={0.8}
                >
                  {generatingTopic ? (
                    <>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.aiButtonText}>Generating...</Text>
                    </>
                  ) : (
                    <>
                      <Feather name="zap" size={18} color="#FFFFFF" />
                      <Text style={styles.aiButtonText}>Generate Terms</Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={styles.aiHintText}>
                  AI will generate key terms and definitions for the topic you enter.
                </Text>
              </View>
            )}

            {/* Upload PDF 面板 - 编辑模式下隐藏 */}
            {!isEditing && activeTab === 'upload-pdf' && (
              <View>
                {/* 使用次数提示（未订阅用户） */}
                {!isPro && (
                  <View style={styles.usageLimitBanner}>
                    <Feather name="info" size={16} color="#6366F1" />
                    <Text style={styles.usageLimitText}>
                      {pdfUploadCount >= FREE_TIER_PDF_UPLOAD_LIMIT 
                        ? 'Free PDF uploads used up. Upgrade to Pro!'
                        : `${FREE_TIER_PDF_UPLOAD_LIMIT - pdfUploadCount} free PDF uploads remaining`}
                    </Text>
                    {pdfUploadCount >= FREE_TIER_PDF_UPLOAD_LIMIT && (
                      <TouchableOpacity
                        style={styles.upgradeButtonSmall}
                        onPress={async () => {
                          await showPaywall();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.upgradeButtonSmallText}>Upgrade</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View style={styles.pdfUploadSection}>
                  <Text style={styles.pdfUploadLabel}>
                    Select a PDF file to extract terms and definitions
                  </Text>
                  
                  {/* 文件选择区域 */}
                  <TouchableOpacity
                    style={styles.pdfDropZone}
                    onPress={handleSelectPDF}
                    activeOpacity={0.8}
                    disabled={uploadingPdf || loading || (!isPro && pdfUploadCount >= FREE_TIER_PDF_UPLOAD_LIMIT)}
                  >
                    {selectedFile && !selectedFile.canceled && selectedFile.assets && selectedFile.assets.length > 0 ? (
                      <View style={styles.pdfFileInfo}>
                        <Feather name="file-text" size={32} color="#6366F1" />
                        <Text style={styles.pdfFileName}>
                          {selectedFile.assets[0].name}
                        </Text>
                        <Text style={styles.pdfFileSize}>
                          {selectedFile.assets[0].size 
                            ? `${(selectedFile.assets[0].size / 1024 / 1024).toFixed(2)} MB`
                            : 'Size unknown'}
                        </Text>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                          }}
                          style={styles.pdfRemoveButton}
                        >
                          <Feather name="x" size={18} color="#EF4444" />
                          <Text style={styles.pdfRemoveButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.pdfDropZoneContent}>
                        <Feather name="upload-cloud" size={48} color="#9CA3AF" />
                        <Text style={styles.pdfDropZoneText}>Tap to select PDF</Text>
                        <Text style={styles.pdfDropZoneHint}>
                          Select a PDF file from your device
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* 上传和处理按钮 */}
                  <TouchableOpacity
                    style={[
                      styles.pdfUploadButton,
                      (!selectedFile || selectedFile.canceled || uploadingPdf || loading || (!isPro && pdfUploadCount >= FREE_TIER_PDF_UPLOAD_LIMIT)) && styles.pdfUploadButtonDisabled
                    ]}
                    onPress={handleUploadAndProcess}
                    disabled={!selectedFile || selectedFile.canceled || uploadingPdf || loading || (!isPro && pdfUploadCount >= FREE_TIER_PDF_UPLOAD_LIMIT)}
                    activeOpacity={0.8}
                  >
                    {uploadingPdf ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.pdfUploadButtonText}>Processing...</Text>
                      </>
                    ) : (
                      <>
                        <Feather name="file-text" size={18} color="#FFFFFF" />
                        <Text style={styles.pdfUploadButtonText}>Upload & Process</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* 解析进度提示 */}
                  {uploadingPdf && (
                    <View style={styles.pdfStatusContainer}>
                      <Text style={styles.pdfStatusText}>
                        {pdfStatus === 'uploading' && 'Uploading PDF to cloud storage...'}
                        {pdfStatus === 'parsing' &&
                          'Analyzing PDF with MinerU. This usually takes 30–90 seconds.'}
                        {pdfStatus === 'extracting' &&
                          'Extracting key terms from the parsed text...'}
                      </Text>
                      <Text style={styles.pdfStatusSubText}>
                        Elapsed: {pdfElapsed}s (typical 30–90s depending on file size)
                      </Text>
                    </View>
                  )}

                  <Text style={styles.pdfHintText}>
                    AI will extract key terms and definitions from your PDF document.
                  </Text>
                </View>
              </View>
            )}

          </View>

          {/* 预览列表 */}
          {validTerms.length > 0 && (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>Review ({validTerms.length} terms)</Text>
              <View style={styles.previewList}>
                {validTerms.map((term, index) => (
                  <View key={term.id} style={styles.previewCard}>
                    <Text style={styles.previewTerm}>{term.term}</Text>
                    <Text style={styles.previewDefinition}>{term.definition}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
  },
  header: {
    marginBottom: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  skipButtonText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  skipButtonTextDisabled: {
    opacity: 0.5,
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    color: '#6366F1',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#6366F1',
  },
  tabContent: {
    minHeight: 200,
    marginBottom: 24,
  },
  termsListContainer: {
    gap: 16,
    marginBottom: 16,
  },
  termRow: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  termRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  termRowNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366F1',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deleteRowButton: {
    padding: 4,
  },
  termInputGroup: {
    marginBottom: 12,
  },
  termLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  termInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  termTextarea: {
    minHeight: 60,
    paddingTop: 10,
  },
  addRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6366F1',
    borderStyle: 'dashed',
    gap: 8,
  },
  addRowButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  aiInputGroup: {
    marginBottom: 16,
  },
  aiLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  aiInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  smartInputSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  smartInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  smartInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  smartTextarea: {
    minHeight: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  autoDetectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  autoDetectButtonDisabled: {
    opacity: 0.6,
  },
  autoDetectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  editorListSection: {
    marginTop: 8,
  },
  editorListTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  aiButtonDisabled: {
    opacity: 0.6,
  },
  aiButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  aiHintText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  previewSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  previewList: {
    gap: 12,
  },
  previewCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewTerm: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  previewDefinition: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  pdfUploadSection: {
    marginBottom: 24,
  },
  pdfUploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  pdfDropZone: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfDropZoneContent: {
    alignItems: 'center',
    gap: 12,
  },
  pdfDropZoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 8,
  },
  pdfDropZoneHint: {
    fontSize: 14,
    color: '#6B7280',
  },
  pdfFileInfo: {
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  pdfFileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginTop: 8,
  },
  pdfFileSize: {
    fontSize: 14,
    color: '#6B7280',
  },
  pdfRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  pdfRemoveButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
  },
  pdfUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  pdfUploadButtonDisabled: {
    opacity: 0.6,
  },
  pdfUploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pdfStatusContainer: {
    marginTop: 12,
    marginBottom: 4,
  },
  pdfStatusText: {
    fontSize: 14,
    color: '#4B5563',
  },
  pdfStatusSubText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  pdfHintText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  usageLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 8,
    flexWrap: 'wrap',
  },
  usageLimitText: {
    flex: 1,
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '500',
  },
  upgradeButtonSmall: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upgradeButtonSmallText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
