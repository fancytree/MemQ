// Supabase Edge Function - Chat Assistant (使用 OpenAI Chat Completions API)
// Deno environment

/// <reference path="./deno.d.ts" />

// @ts-ignore - Deno remote import
import OpenAI from 'https://esm.sh/openai@4';
// @ts-ignore - Deno remote import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 请求体类型定义
interface ChatAssistantRequest {
  thread_id?: string; // 可选的线程 ID，如果不存在则创建新线程
  message: string; // 用户消息
  user_lessons: Array<{ id: string; name: string }>; // 用户课程列表
  mode?: 'normal' | 'vocab_lookup' | 'ask' | 'practice'; // 聊天模式
}

// 响应类型定义
interface ExtractedTerm {
  term: string;
  definition: string;
  explanation?: string; // 详细的语言学信息（IPA, POS, Meaning, Example, Synonyms）
  suggested_action: 'save_to_existing' | 'create_new' | 'save_to_default';
  target_lesson_id?: string;
  target_lesson_name: string;
}

interface ChatAssistantResponse {
  thread_id: string;
  reply_text: string;
  extracted_term: ExtractedTerm | null;
}

// 计算字符串相似度的辅助函数
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) {
    return 1.0;
  }
  
  // 计算编辑距离
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// 计算 Levenshtein 距离
function levenshteinDistance(str1: string, str2: string): number {
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
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// 定义类别关键词映射，用于语义匹配
function getCategoryKeywords(categoryName: string): string[] {
  const categoryLower = categoryName.toLowerCase();
  const keywordMap: Record<string, string[]> = {
    'computer science': ['computer', 'science', 'technology', 'programming', 'software', 'protocol', 'algorithm', 'framework', 'api', 'code', 'developer', 'tech', 'computing', 'system', 'application', 'ai', 'machine learning', 'ml', 'deep learning', 'dl'],
    'english vocabulary': ['english', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase', 'collocation'],
    'italian vocabulary': ['italian', 'italiano', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'spanish vocabulary': ['spanish', 'español', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'french vocabulary': ['french', 'français', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'german vocabulary': ['german', 'deutsch', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'japanese vocabulary': ['japanese', '日本語', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'chinese vocabulary': ['chinese', '中文', 'mandarin', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'korean vocabulary': ['korean', '한국어', 'vocabulary', 'vocab', 'word', 'language', 'learning', 'dictionary', 'term', 'phrase'],
    'chemistry': ['chemistry', 'chemical', 'molecule', 'compound', 'reaction', 'atom', 'element', 'organic', 'inorganic', 'lab', 'benzene'],
    'biology': ['biology', 'biological', 'organism', 'cell', 'genetic', 'dna', 'rna', 'gene', 'evolution', 'life', 'living', 'photosynthesis'],
    'mathematics': ['mathematics', 'math', 'mathematical', 'equation', 'formula', 'calculate', 'number', 'algebra', 'geometry', 'calculus', 'statistics', 'theorem'],
    'history': ['history', 'historical', 'event', 'war', 'ancient', 'century', 'past', 'civilization', 'culture', 'timeline'],
    'physics': ['physics', 'physical', 'force', 'energy', 'motion', 'quantum', 'mechanics', 'thermodynamics', 'electromagnetic'],
    'language learning': ['language', 'translation', 'pronunciation', 'grammar', 'speaking', 'learning', 'foreign', 'linguistic'],
    'general knowledge': ['general', 'knowledge', 'common', 'basic']
  };
  
  return keywordMap[categoryLower] || [];
}

// 检查课程名是否与类别相关（基于关键词匹配和相似度）
function isLessonRelevantToCategory(lessonName: string, categoryName: string): boolean {
  const lessonNameLower = lessonName.toLowerCase().trim();
  const categoryNameLower = categoryName.toLowerCase().trim();
  
  console.log('Checking relevance - Lesson:', lessonNameLower, 'Category:', categoryNameLower);
  
  // 1. 精确匹配
  if (lessonNameLower === categoryNameLower) {
    console.log('  -> Exact match: true');
    return true;
  }
  
  // 2. 包含关系（但要避免误判，比如 "English" 不应该匹配 "Computer Science"）
  // 对于语言相关的 Vocabulary 类别，允许匹配同语言的 lesson
  const languageVocabularyPatterns = [
    { category: 'english vocabulary', languages: ['english'] },
    { category: 'italian vocabulary', languages: ['italian'] },
    { category: 'spanish vocabulary', languages: ['spanish', 'español'] },
    { category: 'french vocabulary', languages: ['french', 'français'] },
    { category: 'german vocabulary', languages: ['german', 'deutsch'] },
    { category: 'japanese vocabulary', languages: ['japanese', '日本語'] },
    { category: 'chinese vocabulary', languages: ['chinese', '中文', 'mandarin'] },
    { category: 'korean vocabulary', languages: ['korean', '한국어'] },
  ];
  
  const languageMatch = languageVocabularyPatterns.find(pattern => 
    categoryNameLower === pattern.category
  );
  
  if (languageMatch) {
    // 如果类别是某种语言的 Vocabulary，检查 lesson 名是否包含该语言
    const hasLanguageMatch = languageMatch.languages.some(lang => 
      lessonNameLower.includes(lang)
    );
    if (hasLanguageMatch) {
      console.log('  -> Language Vocabulary match: true');
      return true;
    }
  }
  
  // 通用包含关系检查
  if (lessonNameLower.includes(categoryNameLower) || categoryNameLower.includes(lessonNameLower)) {
    console.log('  -> Contains match: true');
    return true;
  }
  
  // 3. 基于关键词的匹配
  const categoryKeywords = getCategoryKeywords(categoryName);
  if (categoryKeywords.length > 0) {
    // 检查课程名中是否包含类别关键词
    const hasMatchingKeyword = categoryKeywords.some(keyword => 
      lessonNameLower.includes(keyword)
    );
    
    if (hasMatchingKeyword) {
      console.log('  -> Keyword match: true');
      return true;
    }
  }
  
  // 4. 相似度匹配（作为最后的手段，提高阈值避免误判）
  const similarity = calculateSimilarity(lessonNameLower, categoryNameLower);
  console.log('  -> Similarity:', similarity);
  if (similarity > 0.7) { // 提高阈值从 0.6 到 0.7
    console.log('  -> Similarity match: true');
    return true;
  }
  
  console.log('  -> No match: false');
  return false;
}

// 根据 term 和 definition 生成类别名
function generateCategoryName(term: string, definition: string, chatMode: string): string {
  const termLower = (term || '').toLowerCase().trim();
  const definitionLower = (definition || '').toLowerCase().trim();
  
  console.log('generateCategoryName - term:', term, 'definition:', definition?.substring(0, 100), 'chatMode:', chatMode);
  
  // vocab_lookup 模式：只判断语言类型
  if (chatMode === 'vocab_lookup') {
    // 检测语言类型
    // 根据 term 的特征判断语言
    
    // 意大利语特征：包含常见意大利语字符和词汇
    const italianPatterns = [
      /[àèéìíîòóùú]/i, // 意大利语重音符号
      /\b(piacere|ciao|grazie|prego|scusa|per favore|buongiorno|buonasera|buonanotte|come stai|sto bene|arrivederci|perfetto|bene|male|sì|no|grazie mille|prego|scusi|mi dispiace|ti amo|ti voglio bene)\b/i,
      /\b(di|del|della|dei|delle|con|per|su|in|a|da|tra|fra)\b/i, // 常见意大利语介词
      /(zione|zione|tà|tà|tà|tà)$/i, // 意大利语常见词尾
    ];
    if (italianPatterns.some(pattern => pattern.test(term))) {
      return 'Italian Vocabulary';
    }
    
    // 西班牙语特征
    const spanishPatterns = [
      /[áéíóúñü]/i, // 西班牙语重音符号和特殊字符
      /\b(hola|gracias|por favor|perdón|disculpe|buenos días|buenas tardes|buenas noches|adiós|hasta luego|qué tal|cómo estás|estoy bien|mucho gusto|encantado|encantada|te amo|te quiero|sí|no|muy bien|mal|perfecto)\b/i,
      /\b(del|de la|de los|de las|con|por|sobre|en|a|de|entre|hasta|desde)\b/i, // 常见西班牙语介词
      /(ción|ción|dad|tad|tud)$/i, // 西班牙语常见词尾
    ];
    if (spanishPatterns.some(pattern => pattern.test(term))) {
      return 'Spanish Vocabulary';
    }
    
    // 法语特征
    const frenchPatterns = [
      /[àâäéèêëïîôùûüÿç]/i, // 法语重音符号和特殊字符
      /\b(bonjour|bonsoir|bonne nuit|salut|merci|s'il vous plaît|pardon|excusez-moi|au revoir|à bientôt|comment allez-vous|ça va|très bien|mal|parfait|oui|non|je t'aime|je vous aime)\b/i,
      /\b(du|de la|des|avec|pour|sur|dans|à|de|entre|jusqu'à|depuis)\b/i, // 常见法语介词
      /(tion|sion|tion|sion|ité|té|eur|euse|isme|iste)$/i, // 法语常见词尾
    ];
    if (frenchPatterns.some(pattern => pattern.test(term))) {
      return 'French Vocabulary';
    }
    
    // 德语特征
    const germanPatterns = [
      /[äöüßÄÖÜ]/i, // 德语特殊字符
      /\b(hallo|guten tag|guten morgen|guten abend|gute nacht|danke|bitte|entschuldigung|auf wiedersehen|tschüss|wie geht's|wie geht es dir|mir geht's gut|schlecht|perfekt|ja|nein|ich liebe dich|ich mag dich)\b/i,
      /\b(der|die|das|den|dem|des|mit|für|über|in|auf|zu|von|bei|nach|vor|zwischen)\b/i, // 常见德语冠词和介词
      /(ung|heit|keit|schaft|tum|nis|chen|lein)$/i, // 德语常见词尾
    ];
    if (germanPatterns.some(pattern => pattern.test(term))) {
      return 'German Vocabulary';
    }
    
    // 日语特征（平假名、片假名、汉字）
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(term)) {
      return 'Japanese Vocabulary';
    }
    
    // 中文特征
    if (/[\u4E00-\u9FAF]/.test(term)) {
      return 'Chinese Vocabulary';
    }
    
    // 韩语特征
    if (/[\uAC00-\uD7AF]/.test(term)) {
      return 'Korean Vocabulary';
    }
    
    // 默认：英语
    return 'English Vocabulary';
  }
  
  // ask 模式：根据 term 的实际学科类别来判断
  // 强化分类逻辑：检查 definition 和 term 的关键词
  
  // 计算机/技术相关 - 扩展关键词列表
  const computerScienceKeywords = [
    'protocol', 'algorithm', 'software', 'programming', 'computer', 'api', 'framework',
    'model', 'deployment', 'system', 'application', 'technology', 'tech', 'code',
    'developer', 'computing', 'network', 'server', 'client', 'database', 'data',
    'interface', 'platform', 'service', 'architecture', 'infrastructure', 'cloud',
    'machine learning', 'artificial intelligence', 'ai', 'ml', 'deep learning', 'dl',
    'neural network', 'optimization', 'automation', 'digital', 'electronic',
    'cyber', 'security', 'encryption', 'blockchain', 'cryptocurrency', 'bitcoin',
    'managing', 'controlling', 'operate', 'efficiently', 'effectively'
  ];
  
  const hasComputerScienceKeyword = computerScienceKeywords.some(keyword => {
    const inDefinition = definitionLower.includes(keyword);
    const inTerm = termLower.includes(keyword);
    if (inDefinition || inTerm) {
      console.log('  -> Found Computer Science keyword:', keyword, 'inDefinition:', inDefinition, 'inTerm:', inTerm);
    }
    return inDefinition || inTerm;
  });
  
  const isComputerScienceTerm = termLower.match(/^(api|cpu|gpu|http|https|tcp|ip|udp|mcp|ai|ml|dl|json|xml|html|css|js|ts|sql|nosql|aws|azure|gcp|docker|kubernetes|k8s|git|github|npm|node|react|vue|angular|python|java|javascript|typescript|go|rust|php|ruby|swift|kotlin)$/i);
  
  if (isComputerScienceTerm) {
    console.log('  -> Term matches Computer Science pattern:', termLower);
  }
  
  if (hasComputerScienceKeyword || isComputerScienceTerm) {
    console.log('  -> Returning Computer Science');
    return 'Computer Science';
  }
  
  // 化学相关
  if (definitionLower.includes('chemical') || 
      definitionLower.includes('molecule') || 
      definitionLower.includes('compound') ||
      definitionLower.includes('reaction') ||
      termLower.match(/^(benzene|molecule|atom|element|compound)$/i)) {
    return 'Chemistry';
  }
  
  // 生物相关
  if (definitionLower.includes('organism') || 
      definitionLower.includes('cell') || 
      definitionLower.includes('biology') ||
      definitionLower.includes('photosynthesis') ||
      definitionLower.includes('genetic') ||
      termLower.match(/^(photosynthesis|cell|dna|rna|gene)$/i)) {
    return 'Biology';
  }
  
  // 数学相关
  if (definitionLower.includes('mathematical') || 
      definitionLower.includes('equation') || 
      definitionLower.includes('formula') ||
      definitionLower.includes('calculate') ||
      definitionLower.includes('number') ||
      termLower.match(/^(equation|formula|theorem|algorithm|calculus)$/i)) {
    return 'Mathematics';
  }
  
  // 历史相关
  if (definitionLower.includes('historical') || 
      definitionLower.includes('event') || 
      definitionLower.includes('war') ||
      definitionLower.includes('ancient') ||
      definitionLower.includes('century')) {
    return 'History';
  }
  
  // 物理相关
  if (definitionLower.includes('physics') || 
      definitionLower.includes('force') || 
      definitionLower.includes('energy') ||
      definitionLower.includes('motion') ||
      definitionLower.includes('quantum')) {
    return 'Physics';
  }
  
  // 语言学习相关
  if (definitionLower.includes('language') || 
      definitionLower.includes('translation') || 
      definitionLower.includes('pronunciation') ||
      termLower.match(/^[a-zàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]+$/)) {
    return 'Language Learning';
  }
  
  // 默认
  return 'General Knowledge';
}

Deno.serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 获取认证信息
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 解析请求体
    const body: ChatAssistantRequest = await req.json();

    // 验证输入
    if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid message' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!body.user_lessons || !Array.isArray(body.user_lessons)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid user_lessons array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 获取 OpenAI API Key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY is not set');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Configuration Error',
          message: 'OPENAI_API_KEY environment variable is not set. Please set it using: supabase secrets set OPENAI_API_KEY=your_key',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    // 验证用户
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 创建 Supabase Admin 客户端（用于数据库操作）
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 确定模式（'ask' 和 'practice' 都映射为 'ask'）
    const chatMode = body.mode === 'vocab_lookup' ? 'vocab_lookup' : 'ask';

    // 处理 Thread ID
    let threadId = body.thread_id;
    let isNewThread = false;

    if (!threadId) {
      // 生成新的 thread_id（使用 UUID）
      threadId = crypto.randomUUID();
      isNewThread = true;

      // 保存新线程到数据库
      try {
        const { error: insertError } = await supabaseAdmin
          .from('chat_threads')
          .insert({
            user_id: user.id,
            thread_id: threadId,
            mode: chatMode,
            title: null, // 标题将在首次获取历史时生成
          });
        
        if (insertError) {
          console.error('Error saving thread to database:', insertError);
          // 不抛出错误，继续执行
        }
      } catch (error) {
        console.error('Error saving thread to database:', error);
        // 不抛出错误，继续执行
      }
    } else {
      // 验证线程属于当前用户
      const { data: threadData, error: threadError } = await supabaseAdmin
        .from('chat_threads')
        .select('id, mode')
        .eq('thread_id', threadId)
        .eq('user_id', user.id)
        .single();

      if (threadError || !threadData) {
        return new Response(
          JSON.stringify({ error: 'Thread not found or access denied' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // 更新线程的 updated_at（通过更新模式来触发触发器）
      await supabaseAdmin
        .from('chat_threads')
        .update({ mode: threadData.mode }) // 触发 updated_at 更新
        .eq('id', threadData.id);
    }

    // 从数据库加载历史消息
    const { data: historyMessages, error: historyError } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(50); // 限制最多 50 条消息（避免 token 过多）

    if (historyError) {
      console.error('Error loading history:', historyError);
      // 继续执行，使用空历史
    }

    // 构建用户课程列表字符串（用于 prompt）
    const lessonsListText = body.user_lessons.length > 0
      ? body.user_lessons.map((lesson) => `- "${lesson.name}" (ID: ${lesson.id})`).join('\n')
      : 'No existing lessons';

    // 根据模式构建不同的 System Prompt
    const systemPrompt = chatMode === 'vocab_lookup'
      ? `You are a vocabulary lookup assistant. The user is now in Vocabulary Lookup mode. Treat EVERY input as a word or phrase to be defined and extracted.

CRITICAL RULES:
1. You MUST respond ONLY with valid JSON. Do NOT include any explanatory text, markdown formatting, analysis sections, or additional commentary outside the JSON structure.
2. extracted_term is MANDATORY and CANNOT be null in Vocabulary Lookup mode. You MUST always extract the word/phrase as a term.
3. The "term" field should be the exact word or phrase the user is looking up (case-sensitive if important, otherwise use standard form).

User's Existing Lessons:
${lessonsListText}

Response Format (STRICT JSON ONLY - extracted_term is REQUIRED):
{
  "reply_text": "Formatted text with term, definition, and explanation (see format below)",
  "extracted_term": {
    "term": "The exact word or phrase being looked up (REQUIRED - cannot be null)",
    "definition": "Clear, concise definition of the word",
    "explanation": "Detailed linguistic information in this format: **IPA:** /pronunciation/\\n**POS:** Part of Speech\\n**Meaning:** Detailed meaning\\n**Example:** Example sentence\\n**Synonyms:** synonym1, synonym2",
    "suggested_action": "save_to_existing" | "create_new" | "save_to_default",
    "target_lesson_id": "uuid" (only if suggested_action is "save_to_existing"),
    "target_lesson_name": "Lesson Name" (e.g., "English Vocabulary", "Vocabulary", etc.)
  }
}

When the user provides a word or phrase:
1. Extract the word/phrase as the "term" in extracted_term (this is MANDATORY)
2. Provide a clear, concise definition in "extracted_term.definition"
3. Provide detailed linguistic information in "extracted_term.explanation" with:
   - **IPA:** pronunciation in International Phonetic Alphabet
   - **POS:** Part of Speech (Noun, Verb, Adjective, etc.)
   - **Meaning:** Detailed meaning and usage
   - **Example:** 1-2 example sentences showing how the word is used
   - **Synonyms:** Related words or synonyms (if applicable)
4. Format "reply_text" as follows (use \\n for line breaks):
   term: [the word/phrase]\\n\\ndefinition: [concise definition]\\n\\n[explanation content without headers - just the IPA, POS, Meaning, Example, Synonyms content]
5. For lesson matching (IMPORTANT):
   - Check the user's existing lessons list carefully
   - If you find a lesson that matches the vocabulary topic (e.g., "English Vocabulary", "Vocabulary", "English", or any lesson that seems relevant), use "save_to_existing" and set "target_lesson_name" to the EXACT lesson name from the list
   - The "target_lesson_name" MUST match EXACTLY (case-insensitive) one of the existing lesson names
   - If no existing lesson matches, use "create_new" and suggest a new lesson name like "English Vocabulary" or "Vocabulary"
   - Only use "save_to_default" if the word is too general or unclear
6. Set "target_lesson_name" to:
   - The EXACT name from the existing lessons list (if using "save_to_existing")
   - A new lesson name suggestion (if using "create_new")
   - "Vocabulary" (if using "save_to_default")

Example reply_text format:
term: collocation\\n\\ndefinition: A combination of words that are often used together in a language.\\n\\n/ˌkɒləˈkeɪʃən/\\nNoun\\nA combination of words that are often used together in a language, creating a natural-sounding phrase.\\nExample: "make a decision" and "strong tea" are common collocations.\\nSynonyms: word combination, phrase

EXAMPLES:
- User: "collocation" → extracted_term.term = "collocation" (MANDATORY)
- User: "run" → extracted_term.term = "run" (MANDATORY)
- User: "how to say hello in Spanish" → extracted_term.term = "hola" (the Spanish word, MANDATORY)

IMPORTANT: 
- ALWAYS return ONLY valid JSON, no other text before or after
- extracted_term is REQUIRED and MUST NOT be null in Vocabulary Lookup mode
- Always extract the looked-up word/phrase as a term, even if it's just a single word
- NEVER include markdown formatting, analysis sections, or explanatory text outside the JSON
- If the user asks about a phrase, extract the target language phrase as the term`
      : `You are a smart study assistant. Your goal is to help users capture knowledge.

CRITICAL: You MUST respond ONLY with valid JSON. Do NOT include any explanatory text, markdown formatting, analysis sections, or additional commentary outside the JSON structure.

Response Format (STRICT JSON ONLY):
{
  "reply_text": "Your natural reply to the user's query",
  "extracted_term": {
    "term": "Term Name",
    "definition": "Objective definition",
    "suggested_action": "save_to_existing" | "create_new" | "save_to_default",
    "target_lesson_id": "uuid" (only if suggested_action is "save_to_existing"),
    "target_lesson_name": "Lesson Name"
  } | null
}

User's Existing Lessons:
${lessonsListText}

Analysis Logic:

1. Chat: Reply naturally to the user's query. Be helpful, friendly, and educational. Put your reply in the "reply_text" field.

2. Extract: ALWAYS try to extract a term when the user asks about a concept, word, or definition. Be PROACTIVE in extraction. This is CRITICAL - you MUST extract terms whenever possible.
   
   EXTRACTION RULES (MANDATORY):
   - When user asks "what is X" or "what are X" → ALWAYS extract X as the term (even if X is an abbreviation or acronym)
   - When user asks "what is X in Y" or "what is X in [context]" → Extract X as the term (the main concept being asked about)
   - When user asks "define X" or "explain X" → ALWAYS extract X as the term
   - When user asks "tell me about X" → ALWAYS extract X as the term
   - When user asks "what does X mean?" → ALWAYS extract X as the term
   - When user mentions a specific noun, concept, abbreviation, acronym, or terminology → Extract it as the term
   - Term: The main concept, word, abbreviation, or terminology being asked about
   - Definition: Must be objective and concise, explaining WHAT the term IS (use the definition from your reply_text)
   - Examples (CRITICAL - follow these patterns):
     * User: "what is components?" → Term: "components", Definition: "Individual parts or elements that combine to form a larger whole"
     * User: "What is MCP in AI?" → Term: "MCP", Definition: "Model Control Protocol - a framework used for managing and controlling the deployment of AI models"
     * User: "what is API?" → Term: "API", Definition: "Application Programming Interface - a set of protocols and tools for building software"
     * User: "explain photosynthesis" → Term: "photosynthesis", Definition: "The process by which plants convert light energy into chemical energy"
     * User: "what does CPU mean?" → Term: "CPU", Definition: "Central Processing Unit - the primary component of a computer that performs most processing tasks"
     * User: "what is React in programming?" → Term: "React", Definition: "A JavaScript library for building user interfaces"
   
   SPECIAL RULE FOR TRANSLATIONS:
   - When the user asks "how to say X in [language]" or similar translation questions:
     * The Term should be the TARGET LANGUAGE phrase (the one the user wants to learn)
     * NOT the source language phrase
     * Example: User asks "How to say 'nice to meet you' in Italian?"
       - Term should be: "piacere di conoscerti" (Italian)
       - NOT: "nice to meet you" (English)
     * Definition should explain what the target language phrase means and how to use it
   - For language learning, always prioritize the target language as the Term
   
   WHEN NOT TO EXTRACT:
   - Only set extracted_term to null if the query is too general, conversational, or doesn't contain any specific concept to extract
   - Examples of queries that might not need extraction: "Hello", "How are you?", "Thank you", "Can you help me?"

3. Classify (The most important part):
   - Compare the extracted content with the provided user_lessons list
   - If a lesson name is semantically relevant (e.g., content is 'Benzene', lesson is 'Organic Chemistry'), suggest that lesson ID
   - For language learning: If the term is in a specific language, match it to a lesson with that language name (e.g., "Italian", "Italian Language", etc.)
   - If NO lesson matches, use "create_new" and suggest a CONCISE category name based on the topic (e.g., "Computer Science", "Biology", "History", "Mathematics", "English Vocabulary", "Chemistry", "Physics", "Language Learning")
   - The suggested lesson name should be a broad category that the term belongs to, not too specific
   - Examples:
     * Term: "MCP" (Model Control Protocol) → "Computer Science"
     * Term: "photosynthesis" → "Biology"
     * Term: "collocation" → "English Vocabulary"
     * Term: "Benzene" → "Chemistry"
     * Term: "quantum" → "Physics"
   - If the topic is too general or unclear, use 'save_to_default' action

IMPORTANT RULES:
- ALWAYS return ONLY valid JSON, no other text before or after
- Be PROACTIVE in extracting terms - if the user asks about a concept, word, or definition, extract it
- When user asks "what is X", "what are X", "define X", "explain X", or "tell me about X" → ALWAYS extract X as the term
- Only set extracted_term to null if the query is purely conversational with no specific concept (e.g., "Hello", "Thank you")
- For translations: Extract the TARGET LANGUAGE phrase as the Term, not the source language
- Be smart about matching topics to existing lessons (semantic matching)
- If creating a new lesson, suggest a concise, descriptive name
- NEVER include markdown formatting, analysis sections, or explanatory text outside the JSON`;
    
    // 构建消息数组
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // 添加历史消息（如果有）
    if (historyMessages && historyMessages.length > 0) {
      for (const msg of historyMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // 添加当前用户消息
    messages.push({
      role: 'user',
      content: body.message,
    });

    // 调用 OpenAI Chat Completions API
    const openaiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';
    const completion = await openai.chat.completions.create({
      model: openaiModel,
      messages: messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    // 解析 JSON 响应
    let parsedResponse: { reply_text: string; extracted_term: ExtractedTerm | null };
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Response content:', responseContent);
      throw new Error('Invalid JSON response from OpenAI');
    }

    // 验证响应格式
    if (!parsedResponse.reply_text || typeof parsedResponse.reply_text !== 'string') {
      throw new Error('Missing or invalid reply_text in response');
    }

    let replyText = parsedResponse.reply_text;
    let extractedTerm: ExtractedTerm | null = parsedResponse.extracted_term || null;

    console.log('Initial extracted_term from AI:', extractedTerm);
    console.log('Chat mode:', chatMode);
    console.log('User message:', body.message);

    // 后备提取逻辑：如果 AI 没有提取 term，尝试从用户消息中提取
    if (!extractedTerm && chatMode === 'ask') {
      const userMessage = body.message.trim();
      console.log('Backup extraction: checking user message:', userMessage);
      
      // 优先匹配 "what is X in Y" 格式（如 "What is MCP in AI?"）
      // 匹配模式：what is/are [大写缩写或单词] in [任何内容]
      const whatIsInMatch = userMessage.match(/what\s+(?:is|are)\s+([A-Z]{2,}|[A-Z][a-z]+)\s+in\s+[^?]+\??/i);
      console.log('whatIsInMatch result:', whatIsInMatch);
      if (whatIsInMatch && whatIsInMatch[1]) {
        const extractedWord = whatIsInMatch[1].trim();
        // 从回复中提取定义（第一句话或前200字符）
        let definition = replyText.split(/[.!?]/)[0].trim();
        if (definition.length > 200) {
          definition = definition.substring(0, 200);
        }
        
        console.log('Extracted word:', extractedWord, 'Definition length:', definition.length);
        if (extractedWord && definition && extractedWord.length > 0 && definition.length > 0) {
          console.log('Backup extraction (what is X in Y): extracted term:', extractedWord);
          extractedTerm = {
            term: extractedWord,
            definition: definition,
            suggested_action: 'create_new', // 改为 create_new，让分类逻辑决定类别名
            target_lesson_name: '', // 留空，让分类逻辑生成
          };
        } else {
          console.log('Backup extraction failed: extractedWord=', extractedWord, 'definition=', definition);
        }
      } else {
        console.log('whatIsInMatch did not match');
      }
      
      // 匹配 "what is X" 或 "what are X" 格式
      if (!extractedTerm) {
        const whatIsMatch = userMessage.match(/what\s+(?:is|are)\s+([A-Z]{2,}|[A-Z][a-z]+(?:\s+[a-z]+)*)\??/i);
        console.log('whatIsMatch result:', whatIsMatch);
        if (whatIsMatch && whatIsMatch[1]) {
          const extractedWord = whatIsMatch[1].trim();
          // 从回复中提取定义（第一句话或前200字符）
          const definition = replyText.split(/[.!?]/)[0].trim().substring(0, 200);
          
          console.log('Extracted word:', extractedWord, 'Definition:', definition);
          if (extractedWord && definition && extractedWord.length > 0) {
            console.log('Backup extraction (what is X): extracted term:', extractedWord);
            extractedTerm = {
              term: extractedWord,
              definition: definition,
              suggested_action: 'create_new', // 改为 create_new，让分类逻辑决定类别名
              target_lesson_name: '', // 留空，让分类逻辑生成
            };
          }
        }
      }
      
      // 匹配 "define X" 或 "explain X"
      if (!extractedTerm) {
        const defineMatch = userMessage.match(/(?:define|explain|tell me about)\s+([A-Z]{2,}|[A-Z][a-z]+(?:\s+[a-z]+)*)\??/i);
        if (defineMatch && defineMatch[1]) {
          const extractedWord = defineMatch[1].trim();
          const definition = replyText.split(/[.!?]/)[0].trim().substring(0, 200);
          
          if (extractedWord && definition && extractedWord.length > 0) {
            console.log('Backup extraction: extracted term from user message:', extractedWord);
            extractedTerm = {
              term: extractedWord,
              definition: definition,
              suggested_action: 'create_new', // 改为 create_new，让分类逻辑决定类别名
              target_lesson_name: '', // 留空，让分类逻辑生成
            };
          }
          }
        }
        
      // 匹配 "what does X mean?"
        if (!extractedTerm) {
        const meanMatch = userMessage.match(/what\s+does\s+([A-Z]{2,}|[A-Z][a-z]+)\s+mean\??/i);
        if (meanMatch && meanMatch[1]) {
          const extractedWord = meanMatch[1].trim();
          const definition = replyText.split(/[.!?]/)[0].trim().substring(0, 200);
          
          if (extractedWord && definition && extractedWord.length > 0) {
            console.log('Backup extraction: extracted term from user message:', extractedWord);
            extractedTerm = {
              term: extractedWord,
              definition: definition,
              suggested_action: 'create_new', // 改为 create_new，让分类逻辑决定类别名
              target_lesson_name: '', // 留空，让分类逻辑生成
            };
          }
        }
      }
      
      console.log('Final extracted_term after backup extraction:', extractedTerm);
    }

    // 在 vocab_lookup 模式下，格式化回复文本
    if (chatMode === 'vocab_lookup' && extractedTerm) {
      // 解析 explanation（如果存在）
      let explanationContent = '';
      if (extractedTerm.explanation) {
        const explanation = extractedTerm.explanation;
        // 处理转义的换行符
        let processedExplanation = explanation.replace(/\\n/g, '\n');
        
        // 移除 Markdown 格式的标题，只保留内容
        explanationContent = processedExplanation
          .replace(/\*\*IPA:\*\*\s*/gi, '')
          .replace(/\*\*POS:\*\*\s*/gi, '')
          .replace(/\*\*Meaning:\*\*\s*/gi, '')
          .replace(/\*\*Example:\*\*\s*/gi, '')
          .replace(/\*\*Synonyms:\*\*\s*/gi, '')
          .replace(/\*\*([^*]+)\*\*/g, '$1') // 移除其他粗体标记
          .trim();
      }

      // 格式化回复文本
      replyText = `term: ${extractedTerm.term}\n\ndefinition: ${extractedTerm.definition}`;
      if (explanationContent) {
        replyText += `\n\n${explanationContent}`;
      }
    }

    // 验证和清理 extracted_term
    // 在 vocab_lookup 模式下，extracted_term 是必需的
    if (chatMode === 'vocab_lookup' && !extractedTerm) {
      // 如果 AI 没有提取 term，从用户消息中提取
      console.warn('vocab_lookup mode: extracted_term is null, creating from user message');
      const userMessage = body.message.trim();
      // 尝试提取单词（移除标点符号，取第一个单词或短语）
      const wordMatch = userMessage.match(/^["']?([^"'\s]+(?:\s+[^"'\s]+)?)["']?/);
      const extractedWord = wordMatch ? wordMatch[1].trim() : userMessage.split(/\s+/)[0];
      
      extractedTerm = {
        term: extractedWord,
        definition: replyText.substring(0, 200), // 使用回复的前200字符作为定义
        suggested_action: 'save_to_default',
        target_lesson_name: 'Vocabulary',
      };
    }

    if (extractedTerm) {
      // 验证必需字段
      if (!extractedTerm.term || !extractedTerm.definition || !extractedTerm.target_lesson_name) {
        console.warn('Invalid extracted_term format, missing required fields:', extractedTerm);
        // 尝试修复而不是设为 null（适用于所有模式）
        extractedTerm.term = extractedTerm.term || body.message.trim().split(/\s+/)[0];
        extractedTerm.definition = extractedTerm.definition || replyText.split(/[.!?]/)[0].trim().substring(0, 200);
        extractedTerm.target_lesson_name = extractedTerm.target_lesson_name || (chatMode === 'vocab_lookup' ? 'Vocabulary' : 'General Knowledge');
        extractedTerm.suggested_action = extractedTerm.suggested_action || 'save_to_default';
        
        // 如果修复后仍然无效，才设为 null
        if (!extractedTerm.term || !extractedTerm.definition || !extractedTerm.target_lesson_name) {
          console.warn('Failed to fix extracted_term, setting to null');
          extractedTerm = null;
        }
      } else if (!['save_to_existing', 'create_new', 'save_to_default'].includes(extractedTerm.suggested_action)) {
        console.warn('Invalid suggested_action:', extractedTerm.suggested_action);
        // 修复而不是设为 null（适用于所有模式）
        extractedTerm.suggested_action = 'save_to_default';
      } else if (extractedTerm) {
        // 核心逻辑：根据 term 判断应该放在哪个 lesson
        // 1. 首先根据 term 和 definition 生成类别名（学科）
        const generatedCategory = generateCategoryName(extractedTerm.term, extractedTerm.definition, chatMode);
        console.log('Generated category for term:', extractedTerm.term, '->', generatedCategory);
        
        // 2. 忽略 AI 返回的 target_lesson_name 和 target_lesson_id，重新匹配
        // 这样可以确保匹配逻辑的一致性
        extractedTerm.target_lesson_name = generatedCategory;
        delete extractedTerm.target_lesson_id;
        
        // 3. 尝试匹配现有 lesson
        const categoryNameLower = generatedCategory.toLowerCase().trim();
        console.log('Matching lesson - Category:', generatedCategory, 'Available lessons:', body.user_lessons.map(l => l.name));
        
        // 3.1 精确匹配（不区分大小写）
        let matchedLesson = body.user_lessons.find(
          (lesson) => lesson.name.toLowerCase().trim() === categoryNameLower
        );
        
        if (matchedLesson) {
          console.log('Exact match found:', matchedLesson.name);
        } else {
          console.log('No exact match, trying semantic matching...');
        }
        
        // 3.2 如果精确匹配失败，尝试基于语义相关性的匹配
        if (!matchedLesson) {
          // 找到所有与目标类别相关的课程
          const relevantLessons = body.user_lessons.filter(lesson => {
            const isRelevant = isLessonRelevantToCategory(lesson.name, generatedCategory);
            console.log(`Checking lesson "${lesson.name}" against category "${generatedCategory}":`, isRelevant);
            return isRelevant;
          });
          
          console.log('Relevant lessons found:', relevantLessons.map(l => l.name));
          
          if (relevantLessons.length > 0) {
            // 选择相似度最高的课程
            matchedLesson = relevantLessons.reduce((best, current) => {
              const bestSimilarity = calculateSimilarity(
                best.name.toLowerCase().trim(), 
                categoryNameLower
              );
              const currentSimilarity = calculateSimilarity(
                current.name.toLowerCase().trim(), 
                categoryNameLower
              );
              console.log(`Similarity comparison - "${best.name}": ${bestSimilarity}, "${current.name}": ${currentSimilarity}`);
              return currentSimilarity > bestSimilarity ? current : best;
            });
            
            // 验证匹配度是否足够高（相似度阈值）
            const matchSimilarity = calculateSimilarity(
              matchedLesson.name.toLowerCase().trim(),
              categoryNameLower
            );
            const isRelevant = isLessonRelevantToCategory(matchedLesson.name, generatedCategory);
            
            console.log('Final match check - Lesson:', matchedLesson.name, 'Similarity:', matchSimilarity, 'Is relevant:', isRelevant);
            
            // 对于语言 Vocabulary，只要通过相关性检查就接受（不要求高相似度）
            // 因为 "Italian" 和 "Italian Vocabulary" 相似度可能不高，但它们是相关的
            const isLanguageVocabulary = generatedCategory.toLowerCase().includes('vocabulary');
            
            // 如果相关性检查通过，直接接受匹配（特别是对于语言 Vocabulary）
            if (isRelevant) {
              console.log('Match accepted - Is relevant:', isRelevant, 'Is language vocabulary:', isLanguageVocabulary, 'Similarity:', matchSimilarity);
              // 对于语言 Vocabulary，即使相似度低也接受
              // 对于其他类别，相似度需要 >= 0.3
              if (isLanguageVocabulary || matchSimilarity >= 0.3) {
                console.log('Matched lesson:', matchedLesson.name);
              } else {
                console.log('Match rejected - Similarity too low:', matchSimilarity);
                matchedLesson = undefined;
              }
            } else {
              console.log('Match rejected - Not relevant');
              matchedLesson = undefined;
            }
          } else {
            console.log('No relevant lessons found for category:', generatedCategory);
          }
        }
        
        // 4. 根据匹配结果设置 suggested_action
        if (matchedLesson) {
          // 匹配度高，使用现有 lesson
          extractedTerm.suggested_action = 'save_to_existing';
          extractedTerm.target_lesson_id = matchedLesson.id;
          extractedTerm.target_lesson_name = matchedLesson.name; // 使用实际的 lesson 名称
          console.log('Using existing lesson:', matchedLesson.name, 'for term:', extractedTerm.term);
        } else {
          // 匹配度不高，建议创建新 lesson（使用生成的类别名）
          extractedTerm.suggested_action = 'create_new';
          extractedTerm.target_lesson_name = generatedCategory;
          console.log('No matching lesson found, suggesting create_new with name:', generatedCategory);
        }
      }
    }

    // 保存消息到数据库
    try {
      // 保存用户消息
      await supabaseAdmin
        .from('chat_messages')
        .insert({
          thread_id: threadId,
          user_id: user.id,
          role: 'user',
          content: body.message,
        });

      // 保存 AI 回复
      await supabaseAdmin
        .from('chat_messages')
        .insert({
          thread_id: threadId,
          user_id: user.id,
          role: 'assistant',
          content: replyText,
        });
    } catch (saveError) {
      console.error('Error saving messages to database:', saveError);
      // 不抛出错误，因为对话已经成功
    }

    // 返回成功响应
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          thread_id: threadId,
          reply_text: replyText,
          extracted_term: extractedTerm,
        } as ChatAssistantResponse,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // 详细的错误日志
    console.error('Error in chat-assistant:', error);
    console.error('Error type:', typeof error);
    console.error('Error name:', error instanceof Error ? error.name : 'N/A');
    console.error('Error message:', error instanceof Error ? error.message : 'N/A');
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');
    
    // 如果是对象，尝试序列化
    if (error && typeof error === 'object') {
      try {
        console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch (serializeError) {
        console.error('Failed to serialize error:', serializeError);
      }
    }
    
    // 返回详细的错误信息
    const errorMessage = error instanceof Error 
      ? error.message 
      : typeof error === 'string' 
        ? error 
        : 'Unknown error';
    
    const errorName = error instanceof Error ? error.name : 'Error';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorName,
        message: errorMessage,
        details: error instanceof Error && error.stack 
          ? error.stack.split('\n').slice(0, 5).join('\n') 
          : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
