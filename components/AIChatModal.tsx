// import EditIcon from '@/components/icons/EditIcon';
import FaceIcon from '@/components/icons/FaceIcon';
import FloatingAIButtonIcon from '@/components/icons/FloatingAIButtonIcon';
// import HistoryIcon from '@/components/icons/HistoryIcon';
import SendIcon from '@/components/icons/SendIcon';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Term 建议类型定义
interface ExtractedTerm {
  term: string;
  definition: string;
  suggested_action: 'save_to_existing' | 'create_new' | 'save_to_default';
  target_lesson_id?: string;
  target_lesson_name: string;
}

// 消息类型定义
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  termSuggestion?: ExtractedTerm | null;
  saved?: boolean; // 标记是否已保存
}

interface AIChatModalProps {
  visible: boolean;
  onClose: () => void;
}

// 聊天入口类型
type ChatEntryType = 'ask' | 'vocab_lookup';

// 本地存储的对话会话
interface ChatSession {
  threadId: string | null;
  messages: Message[];
  lastUpdated: number;
}

export default function AIChatModal({ visible, onClose }: AIChatModalProps) {
  const insets = useSafeAreaInsets();
  const { isPro, showPaywall } = useSubscription();
  const [mode, setMode] = useState<'initial' | 'chat'>('initial');
  const [chatMode, setChatMode] = useState<ChatEntryType>('ask'); // 当前聊天入口
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null); // OpenAI Thread ID
  const flatListRef = useRef<FlatList>(null);
  const prevModeRef = useRef<'initial' | 'chat'>('initial');
  const prevMessagesLengthRef = useRef<number>(0);
  
  // 对话次数限制（未订阅用户每天可以使用8次）
  const FREE_TIER_MESSAGE_LIMIT = 8;
  const [messageCount, setMessageCount] = useState(0);
  
  // 两个入口的对话会话（本地状态）
  const [chatSessions, setChatSessions] = useState<{
    ask: ChatSession;
    vocab_lookup: ChatSession;
  }>({
    ask: { threadId: null, messages: [], lastUpdated: 0 },
    vocab_lookup: { threadId: null, messages: [], lastUpdated: 0 },
  });
  
  // 历史记录相关状态 - 已注释
  // const [showHistory, setShowHistory] = useState(false);
  // const [historyThreads, setHistoryThreads] = useState<Array<{
  //   id: string;
  //   thread_id: string;
  //   title: string;
  //   created_at: string;
  //   updated_at: string;
  //   preview?: string;
  // }>>([]);
  // const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 欢迎消息定义
  const getWelcomeMessage = (entryType: ChatEntryType): Message => {
    const welcomeTexts = {
      ask: "Hello! I'm your AI Study Assistant. How can I help you today?",
      vocab_lookup: "Ready! Type any word, and I'll give you its meaning, pronunciation, and examples.",
    };
    return {
      id: `welcome-${Date.now()}`,
      text: welcomeTexts[entryType],
      sender: 'ai',
    };
  };

  // 从本地存储加载对话会话
  const loadChatSession = async (entryType: ChatEntryType): Promise<ChatSession> => {
    try {
      const messagesKey = `@chat_${entryType}_messages`;
      const threadIdKey = `@chat_${entryType}_threadId`;
      
      const [messagesJson, threadId] = await Promise.all([
        AsyncStorage.getItem(messagesKey),
        AsyncStorage.getItem(threadIdKey),
      ]);

      const messages: Message[] = messagesJson ? JSON.parse(messagesJson) : [];
      const lastUpdated = messages.length > 0 ? Date.now() : 0;

      return {
        threadId: threadId || null,
        messages,
        lastUpdated,
      };
    } catch (error) {
      console.error(`Error loading chat session for ${entryType}:`, error);
      return { threadId: null, messages: [], lastUpdated: 0 };
    }
  };

  // 保存对话会话到本地存储
  const saveChatSession = async (entryType: ChatEntryType, session: ChatSession) => {
    try {
      const messagesKey = `@chat_${entryType}_messages`;
      const threadIdKey = `@chat_${entryType}_threadId`;
      
      await Promise.all([
        AsyncStorage.setItem(messagesKey, JSON.stringify(session.messages)),
        AsyncStorage.setItem(threadIdKey, session.threadId || ''),
      ]);

      // 更新本地状态
      setChatSessions((prev) => ({
        ...prev,
        [entryType]: { ...session, lastUpdated: Date.now() },
      }));
    } catch (error) {
      console.error(`Error saving chat session for ${entryType}:`, error);
    }
  };

  // Clear chat conversation
  const handleClearChat = () => {
    Alert.alert(
      'Clear Chat',
      'Are you sure you want to clear this conversation? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            // Clear messages
            setMessages([]);
            setThreadId(null);
            
            // Clear local storage
            const currentMode = chatMode;
            await saveChatSession(currentMode, {
              threadId: null,
              messages: [],
              lastUpdated: 0,
            });
            
            // Reset message length reference
            prevMessagesLengthRef.current = 0;
          },
        },
      ],
      { cancelable: true }
    );
  };

  // 处理选项按钮点击
  const handleOptionPress = async (option: ChatEntryType) => {
    // 加载该入口的历史对话
    const session = await loadChatSession(option);
    
    // 设置当前入口和线程ID
    setChatMode(option);
    setThreadId(session.threadId);
    
    // 构建消息列表：欢迎消息 + 历史消息
    const welcomeMessage = getWelcomeMessage(option);
    const allMessages = [welcomeMessage, ...session.messages];
    
    setMessages(allMessages);
    setMode('chat');
  };

  // 获取今天的日期字符串（用于每日重置）
  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  // 加载对话次数（未订阅用户，每日重置）
  const loadMessageCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const today = getTodayDateString();
      const countKey = `@ai_chat_message_count_${user.id}_${today}`;
      const lastDateKey = `@ai_chat_message_last_date_${user.id}`;
      
      // 检查是否是新的日期，如果是则重置计数
      const lastDate = await AsyncStorage.getItem(lastDateKey);
      if (lastDate !== today) {
        // 新的一天，重置计数
        await AsyncStorage.setItem(countKey, '0');
        await AsyncStorage.setItem(lastDateKey, today);
        setMessageCount(0);
      } else {
        // 同一天，加载现有计数
      const count = await AsyncStorage.getItem(countKey);
      setMessageCount(count ? parseInt(count, 10) : 0);
      }
    } catch (error) {
      console.error('Error loading message count:', error);
    }
  };

  // 保存对话次数（未订阅用户，每日重置）
  const saveMessageCount = async (count: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const today = getTodayDateString();
      const countKey = `@ai_chat_message_count_${user.id}_${today}`;
      const lastDateKey = `@ai_chat_message_last_date_${user.id}`;
      
      await AsyncStorage.setItem(countKey, count.toString());
      await AsyncStorage.setItem(lastDateKey, today);
      setMessageCount(count);
    } catch (error) {
      console.error('Error saving message count:', error);
    }
  };

  // 当 modal 打开时，重置为初始状态并加载对话次数
  useEffect(() => {
    if (visible) {
      setMode('initial');
      setChatMode('ask');
      setInputText('');
      setMessages([]);
      setThreadId(null);
      // 如果不是 Pro 用户，加载对话次数
      if (!isPro) {
        loadMessageCount();
      }
    }
  }, [visible, isPro]);

  // 获取历史记录 - 已注释
  // const fetchHistory = async () => {
  //   setIsLoadingHistory(true);
  //   try {
  //     const { data, error } = await supabase.functions.invoke('chat-history');
  //     
  //     if (error) {
  //       console.error('Error fetching history:', error);
  //       Alert.alert('Error', 'Failed to load chat history');
  //       return;
  //     }

  //     if (data?.success && data?.data) {
  //       setHistoryThreads(data.data);
  //     }
  //   } catch (error) {
  //     console.error('Error fetching history:', error);
  //     Alert.alert('Error', 'Failed to load chat history');
  //   } finally {
  //     setIsLoadingHistory(false);
  //   }
  // };

  // 加载特定对话 - 已注释
  // const loadThread = async (threadIdToLoad: string) => {
  //   setIsLoading(true);
  //   setShowHistory(false);
  //   
  //   try {
  //     const { data, error } = await supabase.functions.invoke('chat-thread-messages', {
  //       body: { thread_id: threadIdToLoad },
  //     });

  //     if (error) {
  //       console.error('Error loading thread:', error);
  //       Alert.alert('Error', 'Failed to load conversation');
  //       setIsLoading(false);
  //       return;
  //     }

  //     if (data?.success && data?.data?.messages) {
  //       // 转换消息格式
  //       const formattedMessages: Message[] = data.data.messages.map((msg: {
  //         id: string;
  //         role: 'user' | 'assistant';
  //         content: string;
  //         created_at: number;
  //       }) => ({
  //         id: msg.id,
  //         text: msg.content,
  //         sender: msg.role,
  //       }));

  //       // 如果第一条消息是 AI 的欢迎消息，保留它；否则添加默认欢迎消息
  //       if (formattedMessages.length === 0 || formattedMessages[0].sender !== 'ai') {
  //         formattedMessages.unshift({
  //           id: '1',
  //           text: "Hello! I'm your AI Study Assistant. How can I help you today?",
  //           sender: 'ai',
  //         });
  //       }

  //       setMessages(formattedMessages);
  //       setThreadId(threadIdToLoad);
  //       setMode('chat');
  //     }
  //   } catch (error) {
  //     console.error('Error loading thread:', error);
  //     Alert.alert('Error', 'Failed to load conversation');
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // 删除对话线程 - 已注释
  // const deleteThread = async (threadIdToDelete: string, threadTitle: string) => {
  //   Alert.alert(
  //     'Delete Conversation',
  //     `Are you sure you want to delete "${threadTitle}"?`,
  //     [
  //       {
  //         text: 'Cancel',
  //         style: 'cancel',
  //       },
  //       {
  //         text: 'Delete',
  //         style: 'destructive',
  //         onPress: async () => {
  //           try {
  //             const { data, error } = await supabase.functions.invoke('chat-delete-thread', {
  //               body: { thread_id: threadIdToDelete },
  //             });

  //             if (error) {
  //               console.error('Error deleting thread:', error);
  //               Alert.alert('Error', 'Failed to delete conversation');
  //               return;
  //             }

  //             if (data?.success) {
  //               // 从列表中移除
  //               setHistoryThreads((prev) => prev.filter((t) => t.thread_id !== threadIdToDelete));
  //               
  //               // 如果当前正在查看被删除的对话，重置状态
  //               if (threadId === threadIdToDelete) {
  //                 setThreadId(null);
  //                 setMode('initial');
  //                 setMessages([]);
  //                 // 清除本地存储的该对话
  //                 const currentMode = chatMode;
  //                 saveChatSession(currentMode, {
  //                   threadId: null,
  //                   messages: [],
  //                   lastUpdated: 0,
  //                 });
  //               }
  //             }
  //           } catch (error) {
  //             console.error('Error deleting thread:', error);
  //             Alert.alert('Error', 'Failed to delete conversation');
  //           }
  //         },
  //       },
  //     ],
  //     { cancelable: true }
  //   );
  // };

  // 打开历史记录时获取数据 - 已注释
  // useEffect(() => {
  //   if (showHistory) {
  //     fetchHistory();
  //   }
  // }, [showHistory]);

  // 监听键盘显示和隐藏（用于调整输入框位置）
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  // 当消息更新时（新消息添加），更新消息长度引用
  // 注意：使用 inverted 后，新消息会自动出现在列表顶部（视觉上的底部），无需手动滚动
  useEffect(() => {
    if (mode === 'chat') {
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages.length, mode]);

  // 发送消息
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) {
      return;
    }

    // 检查订阅状态和对话次数限制
    if (!isPro) {
      // 未订阅用户：检查是否达到限制
      if (messageCount >= FREE_TIER_MESSAGE_LIMIT) {
        Alert.alert(
          'Upgrade to Pro',
          `You've used all ${FREE_TIER_MESSAGE_LIMIT} free messages today. Upgrade to Pro for unlimited AI conversations!`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Upgrade Now',
              onPress: async () => {
                onClose(); // 关闭聊天窗口
                await showPaywall(); // 显示 Paywall
              },
            },
          ]
        );
        return;
      }
    }

    // 如果还在初始模式，切换到聊天模式
    if (mode === 'initial') {
      setMode('chat');
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'user',
    };

    // 添加用户消息（临时显示，稍后会在保存时包含）
    setMessages((prev) => [...prev, userMessage]);
    const userInput = inputText.trim();
    setInputText('');
    setIsLoading(true);

    // 如果不是 Pro 用户，增加对话次数
    if (!isPro) {
      const newCount = messageCount + 1;
      await saveMessageCount(newCount);
    }

    try {
      // 第一步：获取用户所有课程
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

      // 第二步：调用 chat-assistant API（使用 OpenAI Assistants API）
      // 使用 fetch 直接调用，以便能够读取错误响应体
      let apiData: any = null;
      let apiError: any = null;

      try {
        // 获取用户 token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('User not authenticated');
        }

        // 使用 fetch 直接调用 Edge Function
        const supabaseUrl = 'https://sbwkwfqjpbwmacmrprwn.supabase.co';
        const functionUrl = `${supabaseUrl}/functions/v1/chat-assistant`;
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNid2t3ZnFqcGJ3bWFjbXJwcnduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTYyNTQsImV4cCI6MjA4MDU3MjI1NH0.qfYwvgx0lphtX7_QDIOcgcbHRUtfM12UMNy0MmQr-mw',
          },
          body: JSON.stringify({
            thread_id: threadId || undefined,
            message: userInput,
            user_lessons: userLessons.map((lesson) => ({
              id: lesson.id,
              name: lesson.name,
            })),
            mode: chatMode === 'ask' ? 'normal' : chatMode, // 传递模式信息
          }),
        });

        const responseText = await response.text();
        let responseData: any;
        
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse response:', responseText);
          throw new Error(`Invalid response format: ${responseText.substring(0, 200)}`);
        }

        if (!response.ok) {
          // 非 2xx 响应，提取错误信息
          let errorMsg = responseData.error || responseData.message || `HTTP ${response.status}: ${response.statusText}`;
          
          // 如果有详细信息，添加到错误消息中
          if (responseData.details) {
            errorMsg += `\n\nDetails: ${responseData.details}`;
          }
          
          // 如果有其他字段，也记录
          console.error('Edge Function error response:', {
            status: response.status,
            statusText: response.statusText,
            body: responseData,
            fullResponse: JSON.stringify(responseData, null, 2),
          });
          
          throw new Error(errorMsg);
        }

        apiData = responseData;
      } catch (fetchError: any) {
        console.error('Error calling chat-assistant:', fetchError);
        apiError = fetchError;
      }

      if (apiError) {
        const errorMessage = apiError.message || 'Failed to get AI response';
        console.error('Final error message:', errorMessage);
        throw new Error(errorMessage);
      }

      if (!apiData) {
        throw new Error('No response from API');
      }

      // 调试：记录完整的响应结构
      if (__DEV__) {
      console.log('Full API response:', JSON.stringify(apiData, null, 2));
      }

      // 处理不同的响应格式
      let thread_id: string | null = null;
      let reply_text: string = '';
      let extracted_term: ExtractedTerm | null = null;

      // 情况1: 标准格式 { success: true, data: { ... } }
      if (apiData.success && apiData.data) {
        thread_id = apiData.data.thread_id || null;
        reply_text = apiData.data.reply_text || '';
        extracted_term = apiData.data.extracted_term || null;
      }
      // 情况2: 直接返回数据格式 { thread_id, reply_text, extracted_term }
      else if (apiData.thread_id || apiData.reply_text) {
        if (__DEV__) {
        console.warn('Received direct data format, not wrapped in success/data');
        }
        thread_id = apiData.thread_id || null;
        reply_text = apiData.reply_text || '';
        extracted_term = apiData.extracted_term || null;
      }
      // 情况3: 错误响应
      else if (!apiData.success) {
        const errorMsg = (apiData as any).error || (apiData as any).message || 'Invalid response from API';
        throw new Error(errorMsg);
      }
      // 情况4: 未知格式
      else {
        if (__DEV__) {
        console.error('Unknown response format:', apiData);
        }
        throw new Error('Unknown response format from API');
      }

      // 验证必需字段
      if (!reply_text || typeof reply_text !== 'string') {
        console.error('Invalid or missing reply_text:', reply_text);
        // 尝试从原始响应中提取文本
        if (typeof apiData === 'string') {
          reply_text = apiData;
        } else if (apiData.data && typeof apiData.data === 'string') {
          reply_text = apiData.data;
        } else {
          throw new Error('Missing or invalid reply_text in API response');
        }
      }

      // 调试日志
      if (__DEV__) {
      console.log('Parsed response from chat-assistant:', {
        thread_id,
        reply_text: reply_text?.substring(0, 200),
        extracted_term: extracted_term ? {
          term: extracted_term.term,
          suggested_action: extracted_term.suggested_action,
        } : null,
      });
      }

      // 确保 reply_text 是字符串，不是对象
      let displayText = reply_text;
      if (typeof reply_text !== 'string') {
        if (__DEV__) {
        console.warn('reply_text is not a string, converting:', typeof reply_text);
        }
        displayText = JSON.stringify(reply_text);
      }

      // 验证和清理 extracted_term
      if (extracted_term) {
        // 验证必需字段
        if (!extracted_term.term || !extracted_term.definition || !extracted_term.target_lesson_name) {
          if (__DEV__) {
          console.warn('Invalid extracted_term format, missing required fields:', extracted_term);
          }
          extracted_term = null;
        } else if (!['save_to_existing', 'create_new', 'save_to_default'].includes(extracted_term.suggested_action)) {
          if (__DEV__) {
          console.warn('Invalid suggested_action:', extracted_term.suggested_action);
          }
          extracted_term = null;
        }
      }

      // 清理 displayText：移除可能的 JSON 标记或代码块
      if (displayText.includes('```json') || displayText.includes('```')) {
        if (__DEV__) {
        console.warn('Reply text contains code blocks, attempting to clean...');
        }
        // 尝试提取 JSON 代码块中的内容
        const jsonMatch = displayText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.reply_text && typeof parsed.reply_text === 'string') {
              displayText = parsed.reply_text;
              // 验证 extracted_term 格式后再设置
              if (parsed.extracted_term && !extracted_term) {
                const term = parsed.extracted_term;
                if (term.term && term.definition && term.target_lesson_name && 
                    ['save_to_existing', 'create_new', 'save_to_default'].includes(term.suggested_action)) {
                  extracted_term = term as ExtractedTerm;
                }
              }
            }
          } catch (e) {
            // 如果解析失败，移除代码块标记
            displayText = displayText.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
          }
        } else {
          // 移除所有代码块标记
          displayText = displayText.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
        }
      }

      // 如果 displayText 看起来像 JSON 对象，尝试解析
      if (displayText.trim().startsWith('{') && displayText.trim().endsWith('}')) {
        try {
          const parsed = JSON.parse(displayText);
          if (parsed.reply_text && typeof parsed.reply_text === 'string') {
            displayText = parsed.reply_text;
            // 验证 extracted_term 格式后再设置
            if (parsed.extracted_term && !extracted_term) {
              const term = parsed.extracted_term;
              if (term.term && term.definition && term.target_lesson_name && 
                  ['save_to_existing', 'create_new', 'save_to_default'].includes(term.suggested_action)) {
                extracted_term = term as ExtractedTerm;
              }
            }
          } else if (typeof parsed === 'string') {
            displayText = parsed;
          }
        } catch (e) {
          // 如果解析失败，保持原样
          if (__DEV__) {
          console.warn('Failed to parse JSON-like reply_text:', e);
          }
        }
      }

      // 第三步：保存 thread_id（用于后续对话）
      if (thread_id && thread_id !== threadId) {
        setThreadId(thread_id);
      }

      // 第四步：添加 AI 回复消息
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: displayText,
        sender: 'ai',
        termSuggestion: extracted_term || null,
        saved: false,
      };

      // 更新消息列表（排除欢迎消息，只保存实际对话）
      setMessages((prev) => {
        const newMessages = [...prev, aiMessage];
        
        // 保存到本地存储（排除欢迎消息）
        const messagesToSave = newMessages.filter(
          (msg) => !msg.id.startsWith('welcome-')
        );
        
        // 异步保存到本地存储
        saveChatSession(chatMode, {
          threadId: thread_id || threadId,
          messages: messagesToSave,
          lastUpdated: Date.now(),
        });
        
        return newMessages;
      });
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      
      // 如果发送失败，回退对话次数（未订阅用户）
      if (!isPro && messageCount > 0) {
        const newCount = messageCount - 1;
        await saveMessageCount(newCount);
      }
      
      // 检查是否是 API Key 错误
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('401') || errorMessage.includes('Incorrect API key') || errorMessage.includes('API key')) {
        userFriendlyMessage = 'OpenAI API Key is invalid or expired. Please check your API key configuration in Supabase Dashboard.';
      } else if (errorMessage.includes('OPENAI_API_KEY')) {
        userFriendlyMessage = 'OpenAI API Key is not configured. Please set it in Supabase Dashboard → Settings → Edge Functions → Secrets.';
      }
      
      // 添加错误消息
      const errorAiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: `Sorry, I encountered an error: ${userFriendlyMessage}\n\nPlease contact support if this issue persists.`,
        sender: 'ai',
      };
      setMessages((prev) => [...prev, errorAiMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 保存 Term 到现有课程
  const handleConfirmSave = async (termSuggestion: ExtractedTerm, messageId: string) => {
    if (!termSuggestion.target_lesson_id) {
      Alert.alert('Error', 'No target lesson ID provided');
      return;
    }

    try {
      const { data: insertedTerm, error } = await supabase.from('terms').insert({
        lesson_id: termSuggestion.target_lesson_id,
        term: termSuggestion.term,
        definition: termSuggestion.definition,
        explanation: null,
      }).select().single();

      if (error) {
        console.error('Error saving term:', error);
        Alert.alert('Error', `Failed to save term: ${error.message}`);
        return;
      }

      // 更新消息状态为已保存
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, saved: true } : msg
        )
      );

      Alert.alert('Success', 'Term saved successfully!');

      // 静默生成问题
      if (insertedTerm) {
        try {
          await supabase.functions.invoke('generate-questions', {
            body: {
              lessonId: termSuggestion.target_lesson_id,
              terms: [{
                id: insertedTerm.id,
                term: insertedTerm.term,
                definition: insertedTerm.definition,
              }],
            },
          });
          if (__DEV__) {
          console.log('Questions generated successfully for term:', insertedTerm.term);
          }
        } catch (generateError) {
          // 静默失败，只记录错误
          console.error('Error generating questions (non-blocking):', generateError);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Something went wrong');
    }
  };

  // 创建新课程并保存 Term
  const handleCreateAndSave = async (termSuggestion: ExtractedTerm, messageId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // 第一步：创建新课程
      // 如果在 vocab_lookup 模式下，或者 lesson 名称包含 "Vocabulary"，自动开启 Vocabulary mode
      const isVocabMode = chatMode === 'vocab_lookup' || 
                         termSuggestion.target_lesson_name.toLowerCase().includes('vocabulary') ||
                         termSuggestion.target_lesson_name.toLowerCase().includes('vocab');
      
      const { data: newLesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user.id,
          name: termSuggestion.target_lesson_name,
          description: null,
          deadline: null,
          is_vocab_mode: isVocabMode,
        })
        .select()
        .single();

      if (lessonError || !newLesson) {
        console.error('Error creating lesson:', lessonError);
        Alert.alert('Error', `Failed to create lesson: ${lessonError?.message}`);
        return;
      }

      // 第二步：保存 Term
      const { data: insertedTerm, error: termError } = await supabase.from('terms').insert({
        lesson_id: newLesson.id,
        term: termSuggestion.term,
        definition: termSuggestion.definition,
        explanation: null,
      }).select().single();

      if (termError) {
        console.error('Error saving term:', termError);
        Alert.alert('Error', `Failed to save term: ${termError.message}`);
        return;
      }

      // 更新消息状态为已保存
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, saved: true } : msg
        )
      );

      Alert.alert('Success', `Lesson "${termSuggestion.target_lesson_name}" created and term saved!`);

      // 静默生成问题
      if (insertedTerm) {
        try {
          await supabase.functions.invoke('generate-questions', {
            body: {
              lessonId: newLesson.id,
              terms: [{
                id: insertedTerm.id,
                term: insertedTerm.term,
                definition: insertedTerm.definition,
              }],
            },
          });
          if (__DEV__) {
          console.log('Questions generated successfully for term:', insertedTerm.term);
          }
        } catch (generateError) {
          // 静默失败，只记录错误
          console.error('Error generating questions (non-blocking):', generateError);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Something went wrong');
    }
  };

  // 保存到默认课程
  const handleSaveToDefault = async (termSuggestion: ExtractedTerm, messageId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // 第一步：查找或创建 "Default" 课程
      let defaultLessonId: string;

      const { data: existingDefault, error: findError } = await supabase
        .from('lessons')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Default')
        .maybeSingle();

      if (findError && findError.code !== 'PGRST116') {
        console.error('Error finding default lesson:', findError);
        throw new Error('Failed to find default lesson');
      }

      if (existingDefault) {
        defaultLessonId = existingDefault.id;
      } else {
        // 创建默认课程
        const { data: newDefault, error: createError } = await supabase
          .from('lessons')
          .insert({
            user_id: user.id,
            name: 'Default',
            description: null,
            deadline: null,
          })
          .select()
          .single();

        if (createError || !newDefault) {
          console.error('Error creating default lesson:', createError);
          throw new Error('Failed to create default lesson');
        }

        defaultLessonId = newDefault.id;
      }

      // 第二步：保存 Term
      const { data: insertedTerm, error: termError } = await supabase.from('terms').insert({
        lesson_id: defaultLessonId,
        term: termSuggestion.term,
        definition: termSuggestion.definition,
        explanation: null,
      }).select().single();

      if (termError) {
        console.error('Error saving term:', termError);
        Alert.alert('Error', `Failed to save term: ${termError.message}`);
        return;
      }

      // 更新消息状态为已保存
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, saved: true } : msg
        )
      );

      Alert.alert('Success', 'Term saved to Default lesson!');

      // 静默生成问题
      if (insertedTerm) {
        try {
          await supabase.functions.invoke('generate-questions', {
            body: {
              lessonId: defaultLessonId,
              terms: [{
                id: insertedTerm.id,
                term: insertedTerm.term,
                definition: insertedTerm.definition,
              }],
            },
          });
          if (__DEV__) {
          console.log('Questions generated successfully for term:', insertedTerm.term);
          }
        } catch (generateError) {
          // 静默失败，只记录错误
          console.error('Error generating questions (non-blocking):', generateError);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Something went wrong');
    }
  };

  // 渲染 Term 建议卡片
  const renderTermSuggestion = (termSuggestion: ExtractedTerm, messageId: string, saved: boolean = false) => {
    if (saved) {
      // 已保存状态：显示绿色对勾
      return (
        <View style={styles.suggestionCard}>
          <View style={styles.savedIndicator}>
            <Feather name="check-circle" size={20} color="#10B981" />
            <Text style={styles.savedText}>Saved successfully!</Text>
          </View>
        </View>
      );
    }

    const isExisting = termSuggestion.suggested_action === 'save_to_existing';
    const isCreateNew = termSuggestion.suggested_action === 'create_new';
    const isDefault = termSuggestion.suggested_action === 'save_to_default';

    return (
      <View style={styles.suggestionCard}>
        <View style={styles.suggestionHeader}>
          <Text style={styles.suggestionLabel}>T:</Text>
          <Text style={styles.suggestionTerm}>{termSuggestion.term}</Text>
        </View>
        <View style={styles.suggestionHeader}>
          <Text style={styles.suggestionLabel}>D:</Text>
          <Text style={styles.suggestionDefinition}>{termSuggestion.definition}</Text>
        </View>

        {/* Lesson 提示 */}
        <View style={styles.lessonHint}>
          {isExisting && (
            <Text style={styles.lessonHintText}>
              Save to <Text style={styles.lessonName}>{termSuggestion.target_lesson_name}</Text>?
            </Text>
          )}
          {isCreateNew && (
            <Text style={styles.lessonHintText}>
              No matching lesson found. Create <Text style={styles.lessonName}>'{termSuggestion.target_lesson_name}'</Text>?
            </Text>
          )}
          {isDefault && (
            <Text style={styles.lessonHintText}>
              Save to <Text style={styles.lessonName}>Default</Text>?
            </Text>
          )}
        </View>

        {/* 操作按钮 */}
        <View style={styles.suggestionActions}>
          {isExisting && (
            <>
              <TouchableOpacity
                style={[styles.suggestionButton, styles.primaryButton]}
                onPress={() => handleConfirmSave(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Confirm Save</Text>
              </TouchableOpacity>
            </>
          )}
          {isCreateNew && (
            <>
              <TouchableOpacity
                style={[styles.suggestionButton, styles.primaryButton]}
                onPress={() => handleCreateAndSave(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Create & Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.suggestionButton, styles.secondaryButton]}
                onPress={() => handleSaveToDefault(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Save to 'Default'</Text>
              </TouchableOpacity>
            </>
          )}
          {isDefault && (
            <>
            <TouchableOpacity
                style={[styles.suggestionButton, styles.primaryButton]}
                onPress={() => handleCreateAndSave(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Create & Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.suggestionButton, styles.secondaryButton]}
              onPress={() => handleSaveToDefault(termSuggestion, messageId)}
              activeOpacity={0.7}
            >
                <Text style={styles.secondaryButtonText}>Save to Default</Text>
            </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  // Copy message to clipboard
  const handleCopyMessage = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      // Show success message
      Alert.alert('Copied', 'Message copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy, please try again');
    }
  };

  // 渲染消息气泡
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isUser = item.sender === 'user';
    // 由于使用了 inverted，index === 0 是最新的消息（视觉上的底部），去掉下边距
    const isLastMessage = index === 0;

    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.aiMessageContainer,
          isLastMessage && styles.messageContainerLast,
        ]}
      >
        <View style={styles.messageBubbleWrapper}>
          <Pressable
            style={[
              styles.messageBubble,
              isUser ? styles.userBubble : styles.aiBubble,
            ]}
            onLongPress={() => handleCopyMessage(item.text)}
            delayLongPress={500}
          >
            <Text
              style={[
                styles.messageText,
                isUser ? styles.userMessageText : styles.aiMessageText,
              ]}
              selectable={true}
            >
              {item.text}
            </Text>
          </Pressable>
          {/* 渲染 Term 建议卡片（在 AI 消息气泡下方） */}
          {item.termSuggestion && !isUser && (
            <View style={styles.termSuggestionContainer}>
              {renderTermSuggestion(item.termSuggestion, item.id, item.saved)}
            </View>
          )}
        </View>
      </View>
    );
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
          {mode === 'chat' ? (
            // 对话模式下显示返回按钮
          <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => {
                setMode('initial');
              }}
              activeOpacity={0.7}
            >
              <Feather name="arrow-left" size={20} color="#0A0A0A" />
            </TouchableOpacity>
          ) : (
            // 初始模式下显示关闭按钮
            <TouchableOpacity
              style={styles.toolbarCloseButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Feather name="x" size={24} color="#787496" />
            </TouchableOpacity>
          )}
          
          {/* 历史记录按钮 - 已注释 */}
          {/* <TouchableOpacity
            style={styles.toolbarButton}
            onPress={() => {
              setShowHistory(true);
            }}
            activeOpacity={0.7}
          >
            <HistoryIcon size={20} color="#0A0A0A" />
          </TouchableOpacity> */}
          
          {/* Edit button removed - feature not implemented */}
          
          {/* 右侧：对话模式下显示清空按钮，初始模式下显示占位 */}
          {mode === 'chat' ? (
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={handleClearChat}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={20} color="#0A0A0A" />
          </TouchableOpacity>
          ) : (
            <View style={styles.toolbarButton} />
          )}
        </View>

        {/* Content */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -insets.bottom + 102 :102}
        >
          <View style={[styles.content, mode === 'initial' && styles.contentInitial]}>
            {mode === 'initial' ? (
              <View style={styles.initialContent}>
                {/* 圆形图标 */}
                <View style={styles.iconContainer}>
                  <View style={styles.iconGradient}>
                    <FloatingAIButtonIcon size={64} />
                    <View style={styles.iconFaceContainer}>
                      <FaceIcon size={34} color="#FFFFFF" />
                    </View>
                  </View>
                </View>

                {/* 对话次数提示（未订阅用户） */}
                {!isPro && (
                  <View style={styles.messageLimitBanner}>
                    <Feather name="info" size={16} color="#6366F1" />
                    <Text style={styles.messageLimitText}>
                      {messageCount >= FREE_TIER_MESSAGE_LIMIT 
                        ? 'Daily free messages used up. Upgrade to Pro!'
                        : `${FREE_TIER_MESSAGE_LIMIT - messageCount} free messages remaining today`}
                    </Text>
                    {messageCount >= FREE_TIER_MESSAGE_LIMIT && (
                      <TouchableOpacity
                        style={styles.upgradeButton}
                        onPress={async () => {
                          onClose();
                          await showPaywall();
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.upgradeButtonText}>Upgrade</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

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

                  <TouchableOpacity
                    style={styles.optionButton}
                    onPress={() => handleOptionPress('vocab_lookup')}
                    activeOpacity={0.7}
                  >
                    <Feather name="book-open" size={20} color="#0A0A0A" />
                    <Text style={styles.optionText}>Look up Vocabulary</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {/* Message List */}
                <FlatList
                  ref={flatListRef}
                  data={[...messages].reverse()}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  style={styles.messageList}
                  contentContainerStyle={styles.messageListContent}
                  showsVerticalScrollIndicator={false}
                  inverted={true}
                  removeClippedSubviews={false}
                />

                {/* Loading Indicator */}
                {isLoading && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#6366F1" />
                  </View>
                )}
              </>
            )}

            {/* Input Area - 只在对话模式下显示 */}
            {mode === 'chat' && (
            <>
              {/* 对话次数提示（未订阅用户） */}
              {!isPro && (
                <View style={styles.messageLimitBar}>
                  <Feather name="info" size={14} color="#6366F1" />
                  <Text style={styles.messageLimitBarText}>
                    {messageCount >= FREE_TIER_MESSAGE_LIMIT 
                      ? 'Daily limit reached. Upgrade to Pro!'
                      : `${FREE_TIER_MESSAGE_LIMIT - messageCount} messages left today`}
                  </Text>
                  {messageCount >= FREE_TIER_MESSAGE_LIMIT && (
                    <TouchableOpacity
                      style={styles.upgradeButtonSmall}
                      onPress={async () => {
                        onClose();
                        await showPaywall();
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.upgradeButtonSmallText}>Upgrade</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <View style={[
                styles.inputContainer,
                keyboardHeight > 0 && { 
                  marginBottom: 12
                }
              ]}>
                <TextInput
                  style={styles.input}
                  placeholder="Ask, search, or make anything"
                  placeholderTextColor="#C6C7CB"
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={500}
                  editable={!isLoading && (isPro || messageCount < FREE_TIER_MESSAGE_LIMIT)}
                  autoCapitalize="sentences"
                  autoCorrect={true}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                />
                <View style={styles.inputActions}>
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      (!inputText.trim() || isLoading || (!isPro && messageCount >= FREE_TIER_MESSAGE_LIMIT)) && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || isLoading || (!isPro && messageCount >= FREE_TIER_MESSAGE_LIMIT)}
                    activeOpacity={0.7}
                  >
                    <SendIcon 
                      size={32} 
                      opacity={inputText.trim() && !isLoading && (isPro || messageCount < FREE_TIER_MESSAGE_LIMIT) ? 1 : 0.32} 
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* 历史记录 Modal - 已注释 */}
      {/* <Modal
        visible={showHistory}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setShowHistory(false)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={styles.historyContainer} edges={['top', 'bottom']}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Chat History</Text>
              <TouchableOpacity
                style={styles.historyCloseButton}
                onPress={() => setShowHistory(false)}
                activeOpacity={0.7}
              >
                <Feather name="x" size={24} color="#0A0A0A" />
              </TouchableOpacity>
            </View>

            {isLoadingHistory ? (
              <View style={styles.historyLoadingContainer}>
                <ActivityIndicator size="large" color="#6366F1" />
              </View>
            ) : historyThreads.length === 0 ? (
              <View style={styles.historyEmptyContainer}>
                <Text style={styles.historyEmptyText}>No chat history yet</Text>
                <Text style={styles.historyEmptySubtext}>Start a conversation to see it here</Text>
              </View>
            ) : (
              <FlatList
                data={historyThreads}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const renderRightActions = () => (
                    <View style={styles.historyDeleteAction}>
                      <TouchableOpacity
                        style={styles.historyDeleteButton}
                        onPress={() => deleteThread(item.thread_id, item.title)}
                        activeOpacity={0.8}
                      >
                        <Feather name="trash-2" size={20} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  );

                  return (
                    <Swipeable renderRightActions={renderRightActions}>
                      <TouchableOpacity
                        style={styles.historyItem}
                        onPress={() => loadThread(item.thread_id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.historyItemContent}>
                          <Text style={styles.historyItemTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          {item.preview && (
                            <Text style={styles.historyItemPreview} numberOfLines={2}>
                              {item.preview}
                            </Text>
                          )}
                          <Text style={styles.historyItemDate}>
                            {new Date(item.updated_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={20} color="#9CA3AF" />
                      </TouchableOpacity>
                    </Swipeable>
                  );
                }}
                contentContainerStyle={styles.historyListContent}
              />
            )}
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal> */}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    minHeight: 60,
    backgroundColor: '#FFFFFF',
  },
  toolbarButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarCloseButton: {
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
    paddingTop:0,
    paddingBottom: 0,
    justifyContent: 'flex-end',
  },
  contentInitial: {
    gap: 0,
  },
  initialContent: {
    gap: 8,
    marginBottom: 32,
  },
  iconContainer: {
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  iconGradient: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  iconFaceContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsContainer: {
    gap: 2,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16.615,
    paddingVertical: 10,
    borderRadius: 16.4,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#0A0A0A',
    letterSpacing: -0.3125,
    lineHeight: 24,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 0,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  messageContainerLast: {
    marginBottom: 0,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageBubbleWrapper: {
    maxWidth: '95%',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#6366F1', // 品牌紫色
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  aiMessageText: {
    color: '#111827',
  },
  loadingContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  messageLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    gap: 8,
  },
  messageLimitText: {
    flex: 1,
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '500',
  },
  upgradeButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  messageLimitBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 6,
  },
  messageLimitBarText: {
    flex: 1,
    fontSize: 12,
    color: '#6366F1',
    fontWeight: '500',
  },
  upgradeButtonSmall: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  upgradeButtonSmallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    // 透明度由 SendIcon 组件控制
  },
  termSuggestionContainer: {
    marginTop: 12,
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
  },
  suggestionHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  suggestionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6366F1',
    marginRight: 8,
    minWidth: 20,
  },
  suggestionTerm: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  suggestionDefinition: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  lessonHint: {
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  lessonHintText: {
    fontSize: 14,
    color: '#6B7280',
  },
  lessonName: {
    fontWeight: '600',
    color: '#6366F1',
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  suggestionButton: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthButton: {
    flex: 1,
    minWidth: '100%',
  },
  primaryButton: {
    backgroundColor: '#6366F1',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  savedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  savedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  // 历史记录样式
  historyContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: -0.5,
  },
  historyCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  historyEmptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 8,
    textAlign: 'center',
  },
  historyEmptySubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6A7282',
    textAlign: 'center',
  },
  historyListContent: {
    paddingVertical: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  historyItemContent: {
    flex: 1,
    marginRight: 12,
  },
  historyItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0A',
    marginBottom: 4,
  },
  historyItemPreview: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6A7282',
    marginBottom: 4,
    lineHeight: 20,
  },
  historyItemDate: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9CA3AF',
  },
  // 左滑删除样式
  historyDeleteAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    backgroundColor: '#EF4444',
    paddingRight: 20,
    marginVertical: 4,
    marginRight: 20,
    borderRadius: 12,
  },
  historyDeleteButton: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

