import { homeColors } from '@/theme/colors';
import { DialogHost, dialog } from '@/lib/dialog';
import { BackButton, CloseButton, RoundAction } from '@/components/ui/RoundButtons';
import { LinearGradient } from 'expo-linear-gradient';
import { elevation as cardElevation } from '@/theme';
import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';
// import EditIcon from '@/components/icons/EditIcon';
import FloatingAIButtonIcon from '@/components/icons/FloatingAIButtonIcon';
// import HistoryIcon from '@/components/icons/HistoryIcon';
import SendIcon from '@/components/icons/SendIcon';
import { useSubscription } from '@/context/SubscriptionContext';
import { clearCache } from '@/lib/cache';
import { AI_LIMITS, getAIUsageCount, recordAIUsage } from '@/lib/aiUsage';
import { supabase } from '@/lib/supabase';
import { LanguageCardData, hasLanguageData, normalizeLanguageData } from '@/lib/languageCard';
import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

const aiModalMemoryStorage = new Map<string, string>();
const aiModalStorageFallback: AsyncStorageModule = {
  getItem: async (key: string) => aiModalMemoryStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    aiModalMemoryStorage.set(key, value);
  },
  removeItem: async (key: string) => {
    aiModalMemoryStorage.delete(key);
  },
};
// 当前运行时可能缺失 AsyncStorage 原生模块，这里统一走安全兜底，避免页面崩溃。
const getAIStorage = (): AsyncStorageModule => aiModalStorageFallback;

type ClipboardModule = {
  setStringAsync: (text: string) => Promise<void>;
};

const clipboardFallback: ClipboardModule = {
  setStringAsync: async () => {
    throw new Error('Clipboard unavailable');
  },
};
const getClipboard = (): ClipboardModule => clipboardFallback;

// Term 建议类型定义
interface ExtractedTerm {
  term: string;
  definition: string;
  explanation?: string;
  language_data?: LanguageCardData;
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
type ChatEntryType = 'ask' | 'vocab_lookup' | 'quiz';
type InitialTabType = 'qa' | 'vocabulary' | 'quiz';
type AIStatus = 'thinking' | 'generating' | 'extracting' | 'ready_to_save' | null;

// 本地存储的对话会话
interface ChatSession {
  threadId: string | null;
  messages: Message[];
  lastUpdated: number;
}

interface UserLessonOption {
  id: string;
  name: string;
}

interface LessonDropdownPortalState {
  visible: boolean;
  messageId: string | null;
  x: number;
  y: number;
  width: number;
}

// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// ChatInputBar
//
// 布局策略：
//   TextInput 独占整行宽度（paddingRight 为按钮留白），
//   发送按钮用 position:absolute 贴在右下角。
//   这样避免了 flex-row 里 flex:1 的 TextInput 在 iOS 上
//   宽度不确定导致单行渲染的问题。
//
// 高度策略：
//   用 minHeight + maxHeight 让原生布局自然伸缩，
//   不手动管理 height state（避免 onContentSizeChange 返回
//   受约束高度而不是内容高度的问题）。
//   超过 maxHeight 后开启内部滚动。
// ─────────────────────────────────────────────────────────────

const CIB_LINE_HEIGHT = 22;
const CIB_SEND_SIZE   = 32;
const CIB_H_PAD       = 16;
const CIB_V_PAD       = 10;
const CIB_BTN_GAP     = 8;
/** 发送按钮距右缘略小，视觉上更靠右 */
const CIB_SEND_RIGHT  = 10;
const CIB_MIN_H       = CIB_LINE_HEIGHT;       // 1 行
const CIB_MAX_H       = CIB_LINE_HEIGHT * 3;   // 3 行，约 66px

interface ChatInputBarProps {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  onFocus?: () => void;
  sendEnabled: boolean;
  editable: boolean;
  placeholder?: string;
  extraStyle?: object;
}

function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onFocus,
  sendEnabled,
  editable,
  placeholder = 'Ask, search, or make anything',
  extraStyle,
}: ChatInputBarProps) {
  // scrollEnabled 默认 false：第一次点击立即获焦弹出键盘。
  // 内容超过 maxHeight 后才开启，让用户在固定高度内滚动查看。
  // 注意：用 minHeight/maxHeight 时，onContentSizeChange 报告的是
  // 真实内容高度（不受 min/max 约束），所以判断是准确的。
  const [scrollEnabled, setScrollEnabled] = React.useState(false);

  return (
    <View style={[cibStyles.bar, extraStyle]}>
      <TextInput accessibilityLabel={placeholder}
        style={cibStyles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline
        scrollEnabled={scrollEnabled}
        editable={editable}
        autoCapitalize="sentences"
        autoCorrect
        textAlignVertical="top"
        maxLength={500}
        onContentSizeChange={({ nativeEvent }) => {
          setScrollEnabled(nativeEvent.contentSize.height > CIB_MAX_H);
        }}
      />

      {/* 绝对定位于右下角，不与 TextInput 共享 flex-row */}
      <TouchableOpacity accessibilityRole="button"
        style={cibStyles.sendBtn}
        onPress={onSend}
        disabled={!sendEnabled}
        activeOpacity={0.7}
      >
        <SendIcon size={CIB_SEND_SIZE} opacity={sendEnabled ? 1 : 0.32} />
      </TouchableOpacity>
    </View>
  );
}

const cibStyles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    boxShadow: `0px 4px 0px ${homeColors.border}`,
    paddingLeft: CIB_H_PAD,
    // 右侧留出按钮宽度 + 间距，文字不会被遮住
    paddingRight: CIB_SEND_RIGHT + CIB_SEND_SIZE + CIB_BTN_GAP,
    paddingTop: CIB_V_PAD,
    paddingBottom: CIB_V_PAD,
  },
  input: {
    // minHeight → 默认 1 行；maxHeight → 超过后固定高度 + 内部滚动
    // 不设固定 height，让原生布局自由伸缩
    minHeight: CIB_MIN_H,
    maxHeight: CIB_MAX_H,
    fontSize: 16,
    fontFamily: fonts.regular,
    lineHeight: CIB_LINE_HEIGHT,
    letterSpacing: -0.3125,
    color: colors.text,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
  },
  sendBtn: {
    position: 'absolute',
    right: CIB_SEND_RIGHT,
    // (V_PAD*2 + MIN_H - SEND_SIZE) / 2 = (10+10+22-32)/2 = 5
    // 单行时按钮垂直居中；多行时贴向底部
    bottom: (CIB_V_PAD * 2 + CIB_MIN_H - CIB_SEND_SIZE) / 2,
    width: CIB_SEND_SIZE,
    height: CIB_SEND_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─────────────────────────────────────────────────────────────

export default function AIChatModal({ visible, onClose }: AIChatModalProps) {

  const insets = useSafeAreaInsets();
  const { isPro, showPaywall } = useSubscription();
  const [mode, setMode] = useState<'initial' | 'chat'>('initial');
  const [chatMode, setChatMode] = useState<ChatEntryType>('ask'); // 当前聊天入口
  const [initialTab, setInitialTab] = useState<InitialTabType>('qa');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [initialInputScrollEnabled, setInitialInputScrollEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>(null);
  const [aiStatusDots, setAiStatusDots] = useState(1);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [threadId, setThreadId] = useState<string | null>(null); // OpenAI Thread ID
  const [availableLessons, setAvailableLessons] = useState<UserLessonOption[]>([]);
  const [quizTargetLessonId, setQuizTargetLessonId] = useState<string>('random');
  const [quizLessonSearch, setQuizLessonSearch] = useState('');
  const [lessonDraftByMessage, setLessonDraftByMessage] = useState<Record<string, string>>({});
  const [lessonDropdownOpenByMessage, setLessonDropdownOpenByMessage] = useState<Record<string, boolean>>({});
  const [activeLessonMessageId, setActiveLessonMessageId] = useState<string | null>(null);
  const [lessonDropdownPortal, setLessonDropdownPortal] = useState<LessonDropdownPortalState>({
    visible: false,
    messageId: null,
    x: 0,
    y: 0,
    width: 0,
  });
  const lessonInputWrapRefs = useRef<Record<string, View | null>>({});
  const flatListRef = useRef<FlatList>(null);
  const initialScrollRef = useRef<ScrollView>(null);
  const prevModeRef = useRef<'initial' | 'chat'>('initial');
  const prevMessagesLengthRef = useRef<number>(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 与 lib/aiUsage.ts 中 ai_chat 日限额一致
  const FREE_TIER_MESSAGE_LIMIT = AI_LIMITS.ai_chat.free;
  const [messageCount, setMessageCount] = useState(0);

  // 两个入口的对话会话（本地状态）
  const [chatSessions, setChatSessions] = useState<{
    ask: ChatSession;
    vocab_lookup: ChatSession;
    quiz: ChatSession;
  }>({
    ask: { threadId: null, messages: [], lastUpdated: 0 },
    vocab_lookup: { threadId: null, messages: [], lastUpdated: 0 },
    quiz: { threadId: null, messages: [], lastUpdated: 0 },
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
      quiz: "Ready for practice! Choose a lesson (or Random), and I'll start a focused quiz with adaptive difficulty.",
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
        getAIStorage().getItem(messagesKey),
        getAIStorage().getItem(threadIdKey),
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
        getAIStorage().setItem(messagesKey, JSON.stringify(session.messages)),
        getAIStorage().setItem(threadIdKey, session.threadId || ''),
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
    dialog(
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

  const getEntryTypeFromTab = (tab: InitialTabType): ChatEntryType =>
    tab === 'qa' ? 'ask' : tab === 'vocabulary' ? 'vocab_lookup' : 'quiz';

  // 获取今天的日期字符串（用于每日重置）
  const getTodayDateString = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  // 加载对话次数（未订阅用户，每日重置）
  // 从 Supabase 加载今日 ai_chat 使用次数
  const loadMessageCount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const count = await getAIUsageCount('ai_chat', user.id);
      setMessageCount(count);
    } catch (error) {
      console.error('Error loading message count:', error);
    }
  };

  // 记录一次 ai_chat 使用（写入 Supabase，在成功响应后调用）
  // 成功拿到 AI 回复后再持久化；本地计数已在发送时乐观 +1，此处不再 +1；写入失败则回滚 -1
  const recordChatUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const ok = await recordAIUsage('ai_chat', user.id);
      if (!ok) {
        setMessageCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error recording chat usage:', error);
      setMessageCount((prev) => Math.max(0, prev - 1));
    }
  };

  // 当 modal 打开时，重置为初始状态并加载对话次数
  useEffect(() => {
    if (visible) {
      setMode('initial');
      setChatMode('ask');
      setInitialTab('qa');
      setInputText('');
      setInitialInputScrollEnabled(false);
      setMessages([]);
      setThreadId(null);
      setAiStatus(null);
      setLessonDraftByMessage({});
      setLessonDropdownOpenByMessage({});
      setActiveLessonMessageId(null);
      setQuizTargetLessonId('random');
      setQuizLessonSearch('');
      setLessonDropdownPortal({
        visible: false,
        messageId: null,
        x: 0,
        y: 0,
        width: 0,
      });
      // 如果不是 Pro 用户，加载对话次数
      if (!isPro) {
        loadMessageCount();
      }

      const loadLessons = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setAvailableLessons([]);
          return;
        }
        const { data } = await supabase
          .from('lessons')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        setAvailableLessons((data || []) as UserLessonOption[]);
      };
      loadLessons();

      // 打开时从本地恢复当前入口（Q&A）的历史会话
      const loadDefaultSession = async () => {
        const session = await loadChatSession('ask');
        setThreadId(session.threadId);
        setMessages(session.messages);
      };
      loadDefaultSession();
    }
  }, [visible, isPro]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!aiStatus || aiStatus === 'ready_to_save') {
      setAiStatusDots(1);
      return;
    }
    const timer = setInterval(() => {
      setAiStatusDots((prev) => (prev % 3) + 1);
    }, 420);
    return () => clearInterval(timer);
  }, [aiStatus]);

  // 获取历史记录 - 已注释
  // const fetchHistory = async () => {
  //   setIsLoadingHistory(true);
  //   try {
  //     const { data, error } = await supabase.functions.invoke('chat-history');
  //
  //     if (error) {
  //       console.error('Error fetching history:', error);
  //       dialog('Error', 'Failed to load chat history');
  //       return;
  //     }

  //     if (data?.success && data?.data) {
  //       setHistoryThreads(data.data);
  //     }
  //   } catch (error) {
  //     console.error('Error fetching history:', error);
  //     dialog('Error', 'Failed to load chat history');
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
  //       dialog('Error', 'Failed to load conversation');
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
  //     dialog('Error', 'Failed to load conversation');
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // 删除对话线程 - 已注释
  // const deleteThread = async (threadIdToDelete: string, threadTitle: string) => {
  //   dialog(
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
  //               dialog('Error', 'Failed to delete conversation');
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
  //             dialog('Error', 'Failed to delete conversation');
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

  useEffect(() => {
    if (mode === 'initial' && messages.length > 0) {
      const timer = setTimeout(() => {
        initialScrollRef.current?.scrollToEnd({ animated: true });
      }, 60);
      return () => clearTimeout(timer);
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
        dialog(
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

    // 保证本次发送使用正确入口，避免 setState 异步导致模式错位
    const activeEntryType: ChatEntryType =
      mode === 'initial' ? getEntryTypeFromTab(initialTab) : chatMode;
    if (mode === 'initial') {
      setChatMode(activeEntryType);
    }

    const selectedQuizLesson =
      quizTargetLessonId === 'random'
        ? null
        : availableLessons.find((lesson) => lesson.id === quizTargetLessonId) || null;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'user',
    };

    // 添加用户消息（临时显示，稍后会在保存时包含）
    setMessages((prev) => [...prev, userMessage]);
    const userInput = inputText.trim();
    const quizBehaviorInstruction =
      activeEntryType !== 'quiz'
        ? ''
        : selectedQuizLesson
        ? `\n\n[QUIZ_SCOPE]\nTarget lesson: ${selectedQuizLesson.name}\nInstructions:\n- Build a flexible practice session based on this lesson only.\n- Start immediately with a real question (no standalone greeting or setup sentence).\n- You may include a very short heading like "Computer Science - Q1" then ask the question.\n- Mix question styles when suitable (definition recall, scenario usage, multiple choice, short answer).\n- Adapt difficulty dynamically based on my answers.\n- Keep each turn focused and interactive.\n[/QUIZ_SCOPE]`
        : `\n\n[QUIZ_SCOPE]\nTarget lesson: RANDOM\nInstructions:\n- Pick one lesson randomly from user_lessons.\n- Do NOT send a standalone announcement sentence (for example "Great, we'll practice...").\n- Start immediately with the first real question.\n- If you need to indicate the chosen lesson, place it in a short heading with the question (example: "[Lesson Name] - Q1: ...").\n- Then continue a flexible practice session for that chosen lesson.\n- Adapt difficulty dynamically based on my answers.\n[/QUIZ_SCOPE]`;
    const userInputWithQuizScope =
      activeEntryType === 'quiz' ? `${userInput}${quizBehaviorInstruction}` : userInput;
    setInputText('');
    setIsLoading(true);
    setAiStatus('thinking');
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = setTimeout(() => {
      setAiStatus('generating');
    }, 450);

    // 如果不是 Pro 用户，乐观更新本地计数（成功后写入 Supabase）
    if (!isPro) {
      setMessageCount((prev) => prev + 1);
    }

    try {
      // 第一步：获取用户所有课程
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, name, learning_mode')
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
            message: userInputWithQuizScope,
            user_lessons: userLessons.map((lesson) => ({
              id: lesson.id,
              name: lesson.name,
              learning_mode: lesson.learning_mode,
            })),
            mode: activeEntryType === 'ask' ? 'normal' : activeEntryType, // 传递模式信息
            quiz_target_lesson_id:
              activeEntryType === 'quiz' && selectedQuizLesson ? selectedQuizLesson.id : undefined,
            quiz_target_lesson_name:
              activeEntryType === 'quiz' && selectedQuizLesson ? selectedQuizLesson.name : 'Random',
            quiz_selection_mode:
              activeEntryType === 'quiz' ? (selectedQuizLesson ? 'fixed_lesson' : 'random_lesson') : undefined,
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

      // quiz 模式只做问答练习，不展示/保存提炼卡片
      if (activeEntryType === 'quiz') {
        extracted_term = null;
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
      setAiStatus('extracting');
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
        saveChatSession(activeEntryType, {
          threadId: thread_id || threadId,
          messages: messagesToSave,
          lastUpdated: Date.now(),
        });

        return newMessages;
      });
      if (extracted_term) {
        setAiStatus('ready_to_save');
        if (statusTimerRef.current) {
          clearTimeout(statusTimerRef.current);
        }
        statusTimerRef.current = setTimeout(() => {
          setAiStatus(null);
        }, 2200);
      } else {
        setAiStatus(null);
      }
      // 成功响应后写入 Supabase（非 Pro 用户）
      if (!isPro) {
        void recordChatUsage();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';

      // 发送失败，回退本地乐观计数
      if (!isPro) {
        setMessageCount((prev) => Math.max(0, prev - 1));
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
      setMessages((prev) => {
        const newMessages = [...prev, errorAiMessage];
        const messagesToSave = newMessages.filter((msg) => !msg.id.startsWith('welcome-'));
        saveChatSession(activeEntryType, {
          threadId,
          messages: messagesToSave,
          lastUpdated: Date.now(),
        });
        return newMessages;
      });
      setAiStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 保存 Term 到现有课程
  const handleConfirmSave = async (termSuggestion: ExtractedTerm, messageId: string) => {
    if (!termSuggestion.target_lesson_id) {
      dialog('Error', 'No target lesson ID provided');
      return;
    }

    try {
      const { data: insertedTerm, error } = await supabase.from('terms').insert({
        lesson_id: termSuggestion.target_lesson_id,
        term: termSuggestion.term,
        definition: termSuggestion.definition,
        explanation: termSuggestion.explanation || null,
        language_data: termSuggestion.language_data && hasLanguageData(normalizeLanguageData(termSuggestion.language_data))
          ? normalizeLanguageData(termSuggestion.language_data) : null,
      }).select().single();

      if (error) {
        console.error('Error saving term:', error);
        dialog('Error', `Failed to save term: ${error.message}`);
        return;
      }

      // 更新消息状态为已保存
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, saved: true } : msg
        )
      );

      dialog('Success', 'Term saved successfully!');

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
      dialog('Error', 'Something went wrong');
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
      const learningMode = chatMode === 'vocab_lookup' ? 'language' : 'knowledge';

      const { data: newLesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          user_id: user.id,
          name: termSuggestion.target_lesson_name,
          description: null,
          deadline: null,
          learning_mode: learningMode,
        })
        .select()
        .single();

      if (lessonError || !newLesson) {
        console.error('Error creating lesson:', lessonError);
        dialog('Error', `Failed to create lesson: ${lessonError?.message}`);
        return;
      }

      // 新课程已创建，清除列表缓存
      void clearCache('DASHBOARD', user.id);
      void clearCache('LESSONS', user.id);

      // 第二步：保存 Term
      const { data: insertedTerm, error: termError } = await supabase.from('terms').insert({
        lesson_id: newLesson.id,
        term: termSuggestion.term,
        definition: termSuggestion.definition,
        explanation: termSuggestion.explanation || null,
        language_data: termSuggestion.language_data && hasLanguageData(normalizeLanguageData(termSuggestion.language_data))
          ? normalizeLanguageData(termSuggestion.language_data) : null,
      }).select().single();

      if (termError) {
        console.error('Error saving term:', termError);
        dialog('Error', `Failed to save term: ${termError.message}`);
        return;
      }

      // 更新消息状态为已保存
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, saved: true } : msg
        )
      );
      setAvailableLessons((prev) => {
        const exists = prev.some((lesson) => lesson.id === newLesson.id);
        if (exists) return prev;
        return [{ id: newLesson.id, name: newLesson.name }, ...prev];
      });

      dialog('Success', `Lesson "${termSuggestion.target_lesson_name}" created and term saved!`);

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
      dialog('Error', 'Something went wrong');
    }
  };

  // 保存到默认课程
  const handleSaveToDefault = async (termSuggestion: ExtractedTerm, messageId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // 第一步：按学习模式查找或创建默认课程
      let defaultLessonId: string;
      const defaultLessonName = chatMode === 'vocab_lookup' ? 'Language' : 'Default';

      const { data: existingDefault, error: findError } = await supabase
        .from('lessons')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', defaultLessonName)
        .eq('learning_mode', chatMode === 'vocab_lookup' ? 'language' : 'knowledge')
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
            name: defaultLessonName,
            description: null,
            deadline: null,
            learning_mode: chatMode === 'vocab_lookup' ? 'language' : 'knowledge',
          })
          .select()
          .single();

        if (createError || !newDefault) {
          console.error('Error creating default lesson:', createError);
          throw new Error('Failed to create default lesson');
        }

        defaultLessonId = newDefault.id;
        // 默认课程已创建，清除列表缓存
        void clearCache('DASHBOARD', user.id);
        void clearCache('LESSONS', user.id);
      }

      // 第二步：保存 Term
      const { data: insertedTerm, error: termError } = await supabase.from('terms').insert({
        lesson_id: defaultLessonId,
        term: termSuggestion.term,
        definition: termSuggestion.definition,
        explanation: termSuggestion.explanation || null,
        language_data: termSuggestion.language_data && hasLanguageData(normalizeLanguageData(termSuggestion.language_data))
          ? normalizeLanguageData(termSuggestion.language_data) : null,
      }).select().single();

      if (termError) {
        console.error('Error saving term:', termError);
        dialog('Error', `Failed to save term: ${termError.message}`);
        return;
      }

      // 更新消息状态为已保存
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, saved: true } : msg
        )
      );

      dialog('Success', 'Term saved to Default lesson!');

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
      dialog('Error', 'Something went wrong');
    }
  };

  const handleSaveToChosenLesson = async (termSuggestion: ExtractedTerm, messageId: string) => {
    setLessonDropdownOpenByMessage((prev) => ({
      ...prev,
      [messageId]: false,
    }));
    closeLessonDropdownPortal();
    const draftName = (lessonDraftByMessage[messageId] || termSuggestion.target_lesson_name || '').trim();
    const chosenName = draftName || 'Default';
    const matchedLesson = availableLessons.find(
      (lesson) => lesson.name.trim().toLowerCase() === chosenName.toLowerCase()
    );

    if (matchedLesson) {
      await handleConfirmSave(
        {
          ...termSuggestion,
          target_lesson_id: matchedLesson.id,
          target_lesson_name: matchedLesson.name,
          suggested_action: 'save_to_existing',
        },
        messageId
      );
      return;
    }

    await handleCreateAndSave(
      {
        ...termSuggestion,
        target_lesson_id: undefined,
        target_lesson_name: chosenName,
        suggested_action: 'create_new',
      },
      messageId
    );
  };

  const getLessonCandidates = (keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return [];
    }
    return availableLessons
      .filter((lesson) => lesson.name.toLowerCase().includes(normalizedKeyword))
      .slice(0, 6);
  };

  const openLessonDropdownPortal = (messageId: string) => {
    const inputWrapRef = lessonInputWrapRefs.current[messageId];
    if (!inputWrapRef) return;
    inputWrapRef.measureInWindow((x, y, width, height) => {
      const safeHeight = height > 0 ? height : 52;
      setLessonDropdownPortal({
        visible: true,
        messageId,
        x,
        y: y + safeHeight + 8,
        width,
      });
    });
  };

  const closeLessonDropdownPortal = () => {
    setLessonDropdownPortal((prev) => ({ ...prev, visible: false, messageId: null }));
    setLessonDropdownOpenByMessage({});
    setActiveLessonMessageId(null);
  };

  const handleInitialTabChange = async (tab: InitialTabType) => {
    closeLessonDropdownPortal();
    const nextEntryType = getEntryTypeFromTab(tab);
    const currentEntryType = getEntryTypeFromTab(initialTab);

    setInitialTab(tab);

    if (nextEntryType === currentEntryType) {
      return;
    }

    // 切换前先保存当前入口会话，避免未落盘消息丢失
    await saveChatSession(currentEntryType, {
      threadId,
      messages,
      lastUpdated: Date.now(),
    });

    const nextSession = await loadChatSession(nextEntryType);
    setChatMode(nextEntryType);
    setThreadId(nextSession.threadId);
    setMessages(nextSession.messages);
  };

  const handleClearCurrentTabConversation = () => {
    const currentEntryType = getEntryTypeFromTab(initialTab);
    dialog(
      'Clear Conversation',
      'Clear this tab conversation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await saveChatSession(currentEntryType, {
              threadId: null,
              messages: [],
              lastUpdated: 0,
            });
            setThreadId(null);
            setMessages([]);
            if (chatMode !== currentEntryType) {
              setChatMode(currentEntryType);
            }
          },
        },
      ],
    );
  };

  // 渲染 Term 建议卡片
  const renderTermSuggestion = (termSuggestion: ExtractedTerm, messageId: string, saved: boolean = false) => {
    if (saved) {
      // 已保存状态：显示绿色对勾
      return (
        <View style={styles.suggestionCard}>
          <View style={styles.savedIndicator}>
            <Feather name="check-circle" size={20} color={colors.green} />
            <Text style={styles.savedText}>Saved successfully!</Text>
          </View>
        </View>
      );
    }

    const isExisting = termSuggestion.suggested_action === 'save_to_existing';
    const isCreateNew = termSuggestion.suggested_action === 'create_new';
    const isDefault = termSuggestion.suggested_action === 'save_to_default';
    const currentDraft = (lessonDraftByMessage[messageId] ?? termSuggestion.target_lesson_name ?? 'Default').trim();
    const lessonCandidates = getLessonCandidates(currentDraft);
    const exactMatch = availableLessons.find(
      (lesson) => lesson.name.trim().toLowerCase() === currentDraft.toLowerCase()
    );
    const showDropdown = Boolean(lessonDropdownOpenByMessage[messageId]);
    const canCreateNew = currentDraft.length > 0 && !exactMatch;
    const dropdownItemCount = lessonCandidates.length + (canCreateNew ? 1 : 0);
    const shouldRenderDropdown = showDropdown && dropdownItemCount > 0;

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
        <View
          style={[
            styles.lessonHint,
          ]}
        >
          <Text style={styles.lessonHintText}>Lesson</Text>
          <View
            collapsable={false}
            ref={(ref) => {
              lessonInputWrapRefs.current[messageId] = ref;
            }}
            style={styles.lessonInputWrap}
            onLayout={() => {
              if (lessonDropdownOpenByMessage[messageId]) {
                setTimeout(() => openLessonDropdownPortal(messageId), 0);
              }
            }}
          >
            <TextInput accessibilityLabel="Type a lesson name"
              style={styles.lessonInput}
              value={lessonDraftByMessage[messageId] ?? termSuggestion.target_lesson_name ?? 'Default'}
              onChangeText={(value) =>
                {
                  const normalizedValue = value.trim();
                  setLessonDraftByMessage((prev) => ({
                    ...prev,
                    [messageId]: value,
                  }));
                  setActiveLessonMessageId(messageId);
                  if (normalizedValue.length === 0) {
                    setLessonDropdownOpenByMessage((prev) => ({
                      ...prev,
                      [messageId]: false,
                    }));
                    setLessonDropdownPortal((prev) => ({ ...prev, visible: false, messageId: null }));
                    return;
                  }
                  setLessonDropdownOpenByMessage((prev) => ({
                    ...prev,
                    [messageId]: true,
                  }));
                  setTimeout(() => openLessonDropdownPortal(messageId), 0);
                }
              }
              onFocus={() =>
                {
                  const currentValue = (lessonDraftByMessage[messageId] ?? termSuggestion.target_lesson_name ?? '').trim();
                  setActiveLessonMessageId(messageId);
                  if (!currentValue) {
                    setLessonDropdownOpenByMessage((prev) => ({
                      ...prev,
                      [messageId]: false,
                    }));
                    return;
                  }
                  setLessonDropdownOpenByMessage({
                    [messageId]: true,
                  });
                  setTimeout(() => openLessonDropdownPortal(messageId), 0);
                }
              }
              placeholder="Type a lesson name"
              placeholderTextColor={colors.muted}
            />
          </View>
          {canCreateNew && (
            <Text style={styles.lessonHintSubtext}>
              If not found, a new lesson will be created automatically.
            </Text>
          )}
          {exactMatch && (
            <Text style={styles.lessonMatchedText}>
              Selected: <Text style={styles.lessonName}>{exactMatch.name}</Text>
            </Text>
          )}
        </View>

        {/* 操作按钮 */}
        <View style={styles.suggestionActions}>
          {isExisting && (
            <>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.suggestionButton, styles.primaryButton]}
                onPress={() => handleSaveToChosenLesson(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Confirm Save</Text>
              </TouchableOpacity>
            </>
          )}
          {isCreateNew && (
            <>
              <TouchableOpacity accessibilityRole="button"
                style={[styles.suggestionButton, styles.primaryButton]}
                onPress={() => handleSaveToChosenLesson(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Confirm Save</Text>
              </TouchableOpacity>
            </>
          )}
          {isDefault && (
            <>
            <TouchableOpacity accessibilityRole="button"
                style={[styles.suggestionButton, styles.primaryButton]}
                onPress={() => handleSaveToChosenLesson(termSuggestion, messageId)}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Confirm Save</Text>
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
      await getClipboard().setStringAsync(text);
      // Show success message
      dialog('Copied', 'Message copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      dialog('Error', 'Failed to copy, please try again');
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
        <View style={[styles.messageBubbleWrapper, !isUser && styles.aiMessageInlineWrap]}>
          {isUser ? (
            <Pressable accessibilityRole="button"
              style={[styles.messageBubble, styles.userBubble]}
              onLongPress={() => handleCopyMessage(item.text)}
              delayLongPress={500}
            >
              <Text style={[styles.messageText, styles.userMessageText]} selectable={true}>
                {item.text}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.aiInlineRow}>
              <View style={styles.aiInlineIcon}>
                <FloatingAIButtonIcon size={14} />
              </View>
              <Pressable accessibilityRole="button" onLongPress={() => handleCopyMessage(item.text)} delayLongPress={500} style={styles.aiInlineTextWrap}>
                <Text style={styles.aiInlineText} selectable={true}>
                  {item.text}
                </Text>
              </Pressable>
            </View>
          )}
          {/* 渲染 Term 建议卡片（在 AI 消息下方） */}
          {item.termSuggestion && !isUser && (
            <View style={styles.termSuggestionContainer}>
              {renderTermSuggestion(item.termSuggestion, item.id, item.saved)}
            </View>
          )}
        </View>
      </View>
    );
  };

  const activeLessonDraft = activeLessonMessageId
    ? (lessonDraftByMessage[activeLessonMessageId] ?? 'Default').trim()
    : '';
  const activeLessonCandidates = getLessonCandidates(activeLessonDraft);
  const selectedQuizLessonName =
    quizTargetLessonId === 'random'
      ? 'Random'
      : availableLessons.find((lesson) => lesson.id === quizTargetLessonId)?.name || 'Random';
  const recentQuizLessons = availableLessons.slice(0, 5);
  const filteredQuizLessons = availableLessons
    .filter((lesson) => !recentQuizLessons.some((recent) => recent.id === lesson.id))
    .filter((lesson) =>
      lesson.name.toLowerCase().includes(quizLessonSearch.trim().toLowerCase())
    )
    .slice(0, 8);
  const activeLessonExactMatch = availableLessons.find(
    (lesson) => lesson.name.trim().toLowerCase() === activeLessonDraft.toLowerCase()
  );
  const activeLessonCanCreateNew = activeLessonDraft.length > 0 && !activeLessonExactMatch;
  const shouldShowLessonDropdownPortal =
    lessonDropdownPortal.visible &&
    !!lessonDropdownPortal.messageId &&
    Boolean(lessonDropdownOpenByMessage[lessonDropdownPortal.messageId]) &&
    (activeLessonCandidates.length > 0 || activeLessonCanCreateNew);
  const currentEntryType = getEntryTypeFromTab(initialTab);
  const currentTabHasConversation =
    (chatMode === currentEntryType
      ? messages
      : chatSessions[currentEntryType]?.messages || []
    ).filter((msg) => !msg.id.startsWith('welcome-')).length > 0;

  const getAiStatusText = () => {
    const dots = '.'.repeat(aiStatusDots);
    if (aiStatus === 'thinking') return `Thinking${dots}`;
    if (aiStatus === 'generating') return `Generating answer${dots}`;
    if (aiStatus === 'extracting') return `Extracting cards${dots}`;
    return 'Ready to save';
  };

  const getInitialInputPlaceholder = () => {
    if (initialTab === 'qa') return 'Ask anything you want to learn...';
    if (initialTab === 'vocabulary') return 'Type a word or phrase to look up...';
    return 'Tell me what to quiz you on...';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar style="dark" />
      <SafeAreaView
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        edges={['left', 'right']}
      >
        <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} style={styles.headerGradient} />
        {mode === 'chat' && (
          <View style={styles.toolbar}>
            <BackButton onPress={() => setMode('initial')} label="Back to the assistant" />
            <RoundAction icon="trash-2" onPress={handleClearChat} label="Delete this conversation" />
          </View>
        )}

        {/* Content */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={[styles.content, mode === 'initial' && styles.contentInitial]}>
            {mode === 'initial' ? (
              <View style={styles.initialScreen}>
                <View style={styles.initialTopFixed}>
                  <View style={styles.assistantHeader}>
                    <View style={styles.assistantHeaderLeft}>
                      <View style={styles.assistantBadge}>
                        <FloatingAIButtonIcon size={20} />
                      </View>
                      <View style={styles.assistantHeaderTextWrap}>
                        <View style={styles.assistantTitleRow}>
                          <Text style={styles.assistantTitle}>Assistant</Text>
                        </View>
                        <Text style={styles.assistantSubtitle}>Your learning companion</Text>
                      </View>
                    </View>
                    {currentTabHasConversation && <RoundAction icon="trash-2" onPress={handleClearCurrentTabConversation} label="Clear conversation" />}
                    <CloseButton onPress={onClose} label="Close the assistant" />
                  </View>

                  <View style={styles.modeTabs}>
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: initialTab === 'qa' }}
                      style={[styles.modeTab, initialTab === 'qa' && styles.modeTabActive]}
                      onPress={() => {
                        handleInitialTabChange('qa');
                      }}
                    >
                      <Text style={[styles.modeTabTitle, initialTab === 'qa' && styles.modeTabTitleActive]}>Q&A</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: initialTab === 'vocabulary' }}
                      style={[styles.modeTab, initialTab === 'vocabulary' && styles.modeTabActive]}
                      onPress={() => {
                        handleInitialTabChange('vocabulary');
                      }}
                    >
                      <Text style={[styles.modeTabTitle, initialTab === 'vocabulary' && styles.modeTabTitleActive]}>Vocabulary</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected: initialTab === 'quiz' }}
                      style={[styles.modeTab, initialTab === 'quiz' && styles.modeTabActive]}
                      onPress={() => {
                        handleInitialTabChange('quiz');
                      }}
                    >
                      <Text style={[styles.modeTabTitle, initialTab === 'quiz' && styles.modeTabTitleActive]}>Quiz me</Text>
                    </Pressable>
                  </View>
                </View>



                <View style={styles.initialMessageArea}>
                <ScrollView
                  ref={initialScrollRef}
                  style={styles.initialScroll}
                  contentContainerStyle={styles.initialScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.initialBody}>
                    <View style={styles.initialPromptRow}>
                      <View style={styles.initialPromptIcon}>
                        <FloatingAIButtonIcon size={16} />
                      </View>
                      <Text style={styles.initialPromptText}>
                        {initialTab === 'qa' &&
                          "Hi there - ask me anything and I'll explain it clearly with step-by-step help."}
                        {initialTab === 'vocabulary' &&
                          "Share a word or phrase and I'll give meaning, usage, and practical examples."}
                        {initialTab === 'quiz' &&
                          "Pick a lesson (or Random), then I'll run a focused quiz and adjust difficulty as you answer."}
                      </Text>
                    </View>

                    {initialTab === 'quiz' && (
                      <View style={styles.quizScopeWrap}>
                        <Text style={styles.quizScopeLabel}>Quiz scope</Text>
                        <View style={styles.quizScopeRecentWrap}>
                          <TouchableOpacity accessibilityRole="button"
                            style={[
                              styles.quizScopeChip,
                              quizTargetLessonId === 'random' && styles.quizScopeChipActive,
                            ]}
                            onPress={() => setQuizTargetLessonId('random')}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.quizScopeChipText,
                                quizTargetLessonId === 'random' && styles.quizScopeChipTextActive,
                              ]}
                            >
                              Random
                            </Text>
                          </TouchableOpacity>
                          {recentQuizLessons.map((lesson) => (
                            <TouchableOpacity accessibilityRole="button"
                              key={lesson.id}
                              style={[
                                styles.quizScopeChip,
                                quizTargetLessonId === lesson.id && styles.quizScopeChipActive,
                              ]}
                              onPress={() => setQuizTargetLessonId(lesson.id)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.quizScopeChipText,
                                  quizTargetLessonId === lesson.id && styles.quizScopeChipTextActive,
                                ]}
                              >
                                {lesson.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TextInput accessibilityLabel="Search more lessons..."
                          style={styles.quizScopeSearchInput}
                          placeholder="Search more lessons..."
                          placeholderTextColor={colors.muted}
                          value={quizLessonSearch}
                          onChangeText={setQuizLessonSearch}
                          onFocus={closeLessonDropdownPortal}
                        />
                        {quizLessonSearch.trim().length > 0 && (
                          <View style={styles.quizScopeSearchList}>
                            {filteredQuizLessons.length > 0 ? (
                              filteredQuizLessons.map((lesson) => (
                                <TouchableOpacity accessibilityRole="button"
                                  key={lesson.id}
                                  style={[
                                    styles.quizScopeSearchItem,
                                    quizTargetLessonId === lesson.id && styles.quizScopeSearchItemActive,
                                  ]}
                                  onPress={() => {
                                    setQuizTargetLessonId(lesson.id);
                                    setQuizLessonSearch('');
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text
                                    style={[
                                      styles.quizScopeSearchItemText,
                                      quizTargetLessonId === lesson.id && styles.quizScopeSearchItemTextActive,
                                    ]}
                                  >
                                    {lesson.name}
                                  </Text>
                                </TouchableOpacity>
                              ))
                            ) : (
                              <View style={styles.quizScopeSearchEmpty}>
                                <Text style={styles.quizScopeSearchEmptyText}>No lessons found</Text>
                              </View>
                            )}
                          </View>
                        )}
                        <Text style={styles.quizScopeSelectedText}>
                          Selected: <Text style={styles.lessonName}>{selectedQuizLessonName}</Text>
                        </Text>
                      </View>
                    )}

                    {initialTab !== 'quiz' && (
                      <View style={styles.quickPrompts}>
                        {(initialTab === 'qa'
                          ? [
                              'What is MCP?',
                              'What is the difference between TCP and UDP?',
                              'How does photosynthesis work?',
                            ]
                          : [
                              'ubiquitous',
                              'on the same wavelength',
                              'resilience',
                            ]
                        ).map((preset) => (
                          <TouchableOpacity accessibilityRole="button"
                            key={preset}
                            style={styles.quickPromptBtn}
                            activeOpacity={0.7}
                            onPress={() => setInputText(preset)}
                          >
                            <Text style={styles.quickPromptText}>{preset}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {messages.length > 0 && (
                      <View style={styles.initialChatPreview}>
                        {messages.slice(-4).map((item) => {
                          const isUser = item.sender === 'user';
                          return (
                            <View
                              key={item.id}
                              style={[
                                styles.messageContainer,
                                isUser ? styles.userMessageContainer : styles.aiMessageContainer,
                              ]}
                            >
                              <View style={[styles.messageBubbleWrapper, !isUser && styles.aiMessageInlineWrap]}>
                                {isUser ? (
                                  <View style={[styles.messageBubble, styles.userBubble]}>
                                    <Text style={[styles.messageText, styles.userMessageText]}>
                                      {item.text}
                                    </Text>
                                  </View>
                                ) : (
                                <View style={styles.aiInlineBlock}>
                                  <View style={styles.aiInlineRow}>
                                    <View style={styles.aiInlineIcon}>
                                      <FloatingAIButtonIcon size={14} />
                                    </View>
                                    <View style={styles.aiInlineTextWrap}>
                                      <Text style={styles.aiInlineText}>{item.text}</Text>
                                    </View>
                                    </View>
                                  {item.termSuggestion && (
                                    <View style={styles.termSuggestionContainer}>
                                      {renderTermSuggestion(item.termSuggestion, item.id, item.saved)}
                                    </View>
                                  )}
                                  </View>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </ScrollView>
                {aiStatus && (
                  <View style={styles.aiStatusContentFloat} pointerEvents="none">
                    <View style={styles.aiStatusFloatInner}>
                      <View style={styles.aiStatusWrap}>
                        <View style={styles.aiStatusDot} />
                        <Text style={styles.aiStatusText}>{getAiStatusText()}</Text>
                      </View>
                    </View>
                  </View>
                )}
                </View>

                <View
                  style={[
                    styles.initialComposerWrap,
                    { paddingBottom: 14 },
                  ]}
                >
                  {!isPro && (
                    <View style={[styles.messageLimitBar, styles.messageLimitBarInComposer]}>
                      <Feather name="info" size={12} color={colors.muted} />
                      <Text style={styles.messageLimitBarText}>
                        {messageCount >= FREE_TIER_MESSAGE_LIMIT
                          ? 'Daily limit reached. Upgrade to Pro!'
                          : `${FREE_TIER_MESSAGE_LIMIT - messageCount} messages left today`}
                      </Text>
                      {messageCount >= FREE_TIER_MESSAGE_LIMIT && (
                        <TouchableOpacity accessibilityRole="button"
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
                  <View style={styles.initialComposer}>
                    <TextInput accessibilityLabel={getInitialInputPlaceholder()}
                      style={styles.initialComposerInput}
                      placeholder={getInitialInputPlaceholder()}
                      placeholderTextColor={colors.muted}
                      value={inputText}
                      onChangeText={setInputText}
                      onFocus={closeLessonDropdownPortal}
                      multiline
                      textAlignVertical="top"
                      scrollEnabled={initialInputScrollEnabled}
                      onContentSizeChange={({ nativeEvent }) => {
                        setInitialInputScrollEnabled(nativeEvent.contentSize.height > 66);
                      }}
                      editable={!isLoading && (isPro || messageCount < FREE_TIER_MESSAGE_LIMIT)}
                      returnKeyType="send"
                    />
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message"
                      style={[
                        styles.initialComposerSend,
                        (!inputText.trim() || isLoading) &&
                          styles.initialComposerSendDisabled,
                      ]}
                      onPress={handleSend}
                      disabled={!inputText.trim() || isLoading}
                      activeOpacity={0.8}
                    >
                      <Feather name="arrow-right" size={18} color={colors.surf} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.chatMessageArea}>
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
                {isLoading && aiStatus && (
                  <View style={styles.aiStatusContentFloat} pointerEvents="none">
                    <View style={styles.aiStatusFloatInner}>
                      <View style={styles.aiStatusWrap}>
                        <View style={styles.aiStatusDot} />
                        <Text style={styles.aiStatusText}>{getAiStatusText()}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Input Area - 只在对话模式下显示 */}
            {mode === 'chat' && (
            <>
              {/* 对话次数提示（未订阅用户） */}
              {!isPro && (
                <View style={[styles.messageLimitBar, styles.messageLimitBarChat]}>
                  <Feather name="info" size={12} color={colors.muted} />
                  <Text style={styles.messageLimitBarText}>
                    {messageCount >= FREE_TIER_MESSAGE_LIMIT
                      ? 'Daily limit reached. Upgrade to Pro!'
                      : `${FREE_TIER_MESSAGE_LIMIT - messageCount} messages left today`}
                  </Text>
                  {messageCount >= FREE_TIER_MESSAGE_LIMIT && (
                    <TouchableOpacity accessibilityRole="button"
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
              {/* ── Chat input bar ── */}
              <ChatInputBar
                value={inputText}
                onChangeText={setInputText}
                onSend={handleSend}
                onFocus={closeLessonDropdownPortal}
                sendEnabled={
                  !!inputText.trim() &&
                  !isLoading &&
                  (isPro || messageCount < FREE_TIER_MESSAGE_LIMIT)
                }
                editable={!isLoading && (isPro || messageCount < FREE_TIER_MESSAGE_LIMIT)}
                extraStyle={keyboardHeight > 0 ? { marginBottom: 12 } : undefined}
              />
            </>
            )}
          </View>
        </KeyboardAvoidingView>
        {shouldShowLessonDropdownPortal && (
          <View style={styles.lessonDropdownPortalLayer} pointerEvents="box-none">
            <View
              style={[
                styles.lessonDropdownPortal,
                {
                  left: lessonDropdownPortal.x,
                  top: lessonDropdownPortal.y,
                  width: lessonDropdownPortal.width,
                },
              ]}
            >
              {activeLessonCandidates.map((lesson, index) => (
                <TouchableOpacity accessibilityRole="button"
                  key={lesson.id}
                  style={[
                    styles.lessonDropdownItem,
                    index === 0 && styles.lessonDropdownItemFirst,
                  ]}
                  onPress={() => {
                    if (!lessonDropdownPortal.messageId) return;
                    const targetMessageId = lessonDropdownPortal.messageId;
                    setLessonDraftByMessage((prev) => ({
                      ...prev,
                      [targetMessageId]: lesson.name,
                    }));
                    closeLessonDropdownPortal();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.lessonDropdownItemText}>{lesson.name}</Text>
                </TouchableOpacity>
              ))}
              {activeLessonCanCreateNew && (
                <TouchableOpacity accessibilityRole="button"
                  style={[
                    styles.lessonDropdownItem,
                    activeLessonCandidates.length === 0 && styles.lessonDropdownItemFirst,
                    styles.lessonDropdownCreateItem,
                  ]}
                  onPress={() => {
                    if (!lessonDropdownPortal.messageId) return;
                    const targetMessageId = lessonDropdownPortal.messageId;
                    setLessonDraftByMessage((prev) => ({
                      ...prev,
                      [targetMessageId]: activeLessonDraft,
                    }));
                    closeLessonDropdownPortal();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.lessonDropdownCreateText}>Create lesson: {activeLessonDraft}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
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
      {/* A dialog raised from in here has to come up from inside this modal. */}
      <DialogHost />
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  container: {
    flex: 1, backgroundColor: homeColors.canvas,
  },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, minHeight: 60,
  },
  toolbarCloseButton: {
    width: 44,
    minHeight: 44,
    borderRadius: 20,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop:0,
    paddingBottom: 0,
    justifyContent: 'flex-end',
  },
  contentInitial: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    justifyContent: 'space-between',
  },
  initialScreen: {
    flex: 1,
  },
  initialTopFixed: {
    zIndex: 20,
  },
  assistantHeader: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  assistantHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  assistantBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: homeColors.deep, alignItems: 'center', justifyContent: 'center',
  },
  assistantHeaderTextWrap: {
    flex: 1,
  },
  assistantTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assistantTitle: {
    fontSize: 26, lineHeight: 34, color: homeColors.deep, fontFamily: fonts.display,
  },
  assistantOnlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  assistantSubtitle: {
    fontSize: 12, lineHeight: 17, color: homeColors.deep, fontFamily: fonts.medium,
  },
  modeTabs: {
    flexDirection: 'row', marginHorizontal: 16, padding: 4, gap: 4, backgroundColor: homeColors.white, borderRadius: 28, boxShadow: `0px 4px 0px ${homeColors.border}`,
  },
  modeTab: {
    flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 24,
  },
  modeTabActive: {
    backgroundColor: homeColors.selected,
  },
  modeTabTitle: {
    fontSize: 14, lineHeight: 20, color: homeColors.deep, fontFamily: fonts.medium,
  },
  modeTabTitleActive: {
    color: homeColors.deep, fontFamily: fonts.semibold,
  },
  modeTabSub: {
    fontSize: 12,
    lineHeight: 14,
    color: colors.muted,
    fontFamily: fonts.medium,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  clearFloatingBtn: {
    position: 'absolute',
    right: 14,
    top: 118,
    width: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surf,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    elevation: 0,
  },
  initialBody: {
    paddingHorizontal: 16, paddingTop: 28,
  },
  // 对话内容区（不含底部输入条）：用于左下角悬浮 AI 状态
  initialMessageArea: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    zIndex: 15,
  },
  chatMessageArea: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  initialScroll: {
    flex: 1,
    zIndex: 1,
  },
  initialScrollContent: {
    paddingBottom: 20,
  },
  initialPromptRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: homeColors.white, borderRadius: 24, padding: 16, boxShadow: `0px 4px 0px ${homeColors.border}`,
  },
  initialPromptIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 1,
  },
  initialPromptText: {
    flex: 1, fontSize: 15, lineHeight: 23, color: homeColors.darkest, fontFamily: fonts.regular,
  },
  tryLabel: {
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 52,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    fontFamily: fonts.bold,
    fontWeight: '700',
    letterSpacing: 1,
  },
  quickPrompts: {
    gap: 10, marginTop: 20,
  },
  initialChatPreview: {
    marginTop: 10,
    gap: 6,
  },
  quizScopeWrap: {
    marginTop: 20, gap: 10,
  },
  quizScopeLabel: {
    fontSize: 12,
    lineHeight: 15,
    color: colors.muted,
    fontFamily: fonts.bold,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  quizScopeRecentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quizScopeChip: {
    minHeight: 44, borderWidth: 1, borderColor: homeColors.border, borderRadius: 22, backgroundColor: homeColors.white, paddingHorizontal: 14, paddingVertical: 9,
  },
  quizScopeChipActive: {
    borderColor: homeColors.selected, backgroundColor: homeColors.selected,
  },
  quizScopeChipText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
    fontFamily: fonts.medium,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  quizScopeChipTextActive: {
    color: colors.accentText,
    fontFamily: fonts.bold,
  },
  quizScopeSearchInput: { minHeight: 44,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    backgroundColor: colors.surf,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: fonts.regular,
    fontWeight: '400',
  },
  quizScopeSearchList: {
    gap: 8,
  },
  quizScopeSearchItem: {
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    backgroundColor: colors.surf,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quizScopeSearchItemActive: {
    borderColor: colors.action,
    backgroundColor: colors.greenL,
  },
  quizScopeSearchItemText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
    fontFamily: fonts.medium,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  quizScopeSearchItemTextActive: {
    color: colors.accentText,
    fontFamily: fonts.bold,
  },
  quizScopeSearchEmpty: {
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    backgroundColor: colors.surf,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  quizScopeSearchEmptyText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    fontFamily: fonts.regular,
    fontWeight: '400',
  },
  quizScopeSelectedText: {
    fontSize: 12,
    lineHeight: 15,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  quickPromptBtn: {
    minHeight: 48, borderWidth: 1, borderColor: homeColors.border, borderRadius: 18, backgroundColor: homeColors.white, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center',
  },
  quickPromptText: {
    fontSize: 14, lineHeight: 20, color: homeColors.deep, fontFamily: fonts.medium,
  },
  initialComposerWrap: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: homeColors.canvas, position: 'relative', zIndex: 10,
  },
  aiStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  // 内容区左下角悬浮（非输入模块）
  aiStatusContentFloat: {
    position: 'absolute',
    left: 14,
    bottom: 10,
    zIndex: 40,
    elevation: 0,
    maxWidth: '88%',
  },
  aiStatusFloatInner: {
    backgroundColor: colors.surfaceGlass,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 6,
  },
  aiStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  aiStatusText: {
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.1,
    color: colors.muted,
    fontFamily: fonts.medium,
    fontWeight: '500',
  },
  initialComposer: {
    borderWidth: 1, borderColor: homeColors.border, borderRadius: 24, backgroundColor: homeColors.white, paddingLeft: 16, paddingRight: 58, paddingTop: 14, paddingBottom: 14, boxShadow: `0px 4px 0px ${homeColors.border}`,
  },
  initialComposerInput: {
    minHeight: 22, maxHeight: 66, fontSize: 15, lineHeight: 22, color: homeColors.darkest, fontFamily: fonts.regular, paddingTop: 0, paddingBottom: 0,
  },
  initialComposerSend: {
    position: 'absolute', right: 9, bottom: 9, width: 34, height: 34, borderRadius: 17, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center',
  },
  initialComposerSendDisabled: {
    opacity: 0.4,
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
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0,
    shadowRadius: 15,
    elevation: 0,
  },
  optionsContainer: {
    gap: 2,
  },
  optionButton: { minHeight: 44,
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
    color: colors.text,
    letterSpacing: -0.3125,
    lineHeight: 24,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-end',
    width: '100%',
  },
  messageContainerLast: {
    marginBottom: 0,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
  },
  messageBubbleWrapper: {
    maxWidth: '82%',
  },
  aiMessageInlineWrap: {
    maxWidth: '100%',
    width: '100%',
    alignSelf: 'stretch',
  },
  aiInlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  aiInlineBlock: {
    flex: 1,
  },
  aiInlineIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aiInlineTextWrap: {
    flex: 1,
  },
  aiInlineText: {
    fontSize: 15, lineHeight: 23, fontFamily: fonts.regular, color: homeColors.darkest,
  },
  messageBubble: {
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: 20, borderWidth: 1, borderColor: homeColors.border,
  },
  userBubble: {
    backgroundColor: homeColors.primary, borderColor: homeColors.primary, borderBottomRightRadius: 6,
  },
  aiBubble: {
    backgroundColor: colors.surf,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15, lineHeight: 23, fontFamily: fonts.regular,
  },
  userMessageText: {
    color: colors.onAction,
  },
  aiMessageText: {
    color: colors.text,
  },
  messageLimitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.aiL,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    gap: 8,
  },
  messageLimitText: {
    flex: 1,
    fontSize: 14,
    color: colors.ai,
    fontWeight: '500',
  },
  upgradeButton: { minHeight: 44,
    backgroundColor: colors.ai,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: colors.onAction,
    fontSize: 14,
    fontWeight: '600',
  },
  messageLimitBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginHorizontal: -12,   // 抵消 content 的 paddingHorizontal:12，撑满宽度
    marginBottom: 0,
    gap: 6,
    backgroundColor: colors.surf,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 2,
    elevation: 0,
  },
  // initial 底部输入容器内：与左右 padding 对齐拉满
  messageLimitBarInComposer: {
    marginHorizontal: -16,
    marginTop: 0,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderTopWidth: 0,
  },
  // chat 底部：保证浮在列表之上、边界清晰
  messageLimitBarChat: {
    marginBottom: 0,
  },
  messageLimitBarText: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.medium,
    fontWeight: '500',
  },
  upgradeButtonSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.action,
  },
  upgradeButtonSmallText: {
    color: colors.action,
    fontSize: 12,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  termSuggestionContainer: {
    marginTop: 12,
  },
  suggestionCard: {
    backgroundColor: colors.surf,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8, ...cardElevation.card, },
  suggestionHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  suggestionLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: colors.accentText,
    fontFamily: fonts.bold,
    marginRight: 8,
    minWidth: 20,
  },
  suggestionTerm: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fonts.semibold,
    letterSpacing: -0.1,
  },
  suggestionDefinition: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontFamily: fonts.regular,
    letterSpacing: -0.1,
  },
  lessonHint: {
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    position: 'relative',
    overflow: 'visible',
  },
  lessonHintOpen: {
    zIndex: 20,
    elevation: 0,
  },
  lessonHintText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  lessonHintSubtext: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 15,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  lessonName: {
    fontWeight: '700',
    color: colors.accentText,
    fontFamily: fonts.bold,
  },
  lessonInput: { minHeight: 44,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: 8,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontWeight: '400',
  },
  lessonInputWrap: {
    position: 'relative',
    zIndex: 30,
    overflow: 'visible',
  },
  lessonDropdownPortalLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
    elevation: 0,
  },
  lessonDropdownPortal: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surf,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 0,
    maxHeight: 240,
  },
  lessonDropdown: {
    position: 'absolute',
    top: '100%',
    marginTop: 6,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surf,
    overflow: 'hidden',
    zIndex: 40,
    elevation: 0,
    maxHeight: 240,
  },
  lessonDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lessonDropdownItemFirst: {
    borderTopWidth: 0,
  },
  lessonDropdownItemText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: fonts.regular,
    letterSpacing: -0.1,
  },
  lessonDropdownCreateItem: {
    backgroundColor: colors.bg,
  },
  lessonDropdownCreateText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
    fontFamily: fonts.semibold,
    letterSpacing: -0.1,
  },
  lessonMatchedText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 15,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  suggestionButton: { minHeight: 44,
    flex: 1,
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthButton: { minHeight: 44,
    flex: 1,
    minWidth: '100%',
  },
  primaryButton: { minHeight: 44,
    backgroundColor: colors.action,
  },
  primaryButtonText: {
    color: colors.onAction,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    fontFamily: fonts.bold,
    letterSpacing: -0.1,
  },
  secondaryButton: { minHeight: 44,
    backgroundColor: colors.surf,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  secondaryButtonText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    letterSpacing: -0.1,
  },
  savedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  savedText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.green,
    fontFamily: fonts.bold,
    letterSpacing: -0.1,
  },
  // 历史记录样式
  historyContainer: {
    flex: 1,
    backgroundColor: colors.surf,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenInline,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.5,
  },
  historyCloseButton: {
    width: 44,
    minHeight: 44,
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
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  historyEmptySubtext: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.muted,
    textAlign: 'center',
  },
  historyListContent: {
    paddingVertical: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  historyItemContent: {
    flex: 1,
    marginRight: 12,
  },
  historyItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  historyItemPreview: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 4,
    lineHeight: 20,
  },
  historyItemDate: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
  },
  // 左滑删除样式
  historyDeleteAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    backgroundColor: colors.red,
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

