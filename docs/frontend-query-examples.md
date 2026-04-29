# 前端查询代码片段

本文档提供了两种学习场景的 Supabase 查询代码片段，可在前端 Hook 中使用。

## Scenario A: 首页全局复习 (Global Review)

目标：找出所有课程中，今天需要复习的词。

### 逻辑说明
- `next_review_at <= now()` 或 `status = 'New'`
- 对于新词，如果该 Lesson 没有 Deadline 或 Deadline 尚早，可以限制每天新词数量（例如 limit 20）
- 排序：优先复习 `next_review_at` 较早的（过期的）

### 代码片段

```typescript
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

interface ReviewTerm {
  term_id: string;
  term: string;
  definition: string;
  lesson_id: string;
  lesson_name: string;
  status: string;
  next_review_at: string | null;
  question_id: string | null;
}

/**
 * 全局复习 Hook
 * 获取所有课程中今天需要复习的词
 */
export function useGlobalReview() {
  const [terms, setTerms] = useState<ReviewTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGlobalReview = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setError('User not authenticated');
          setLoading(false);
          return;
        }

        const now = new Date().toISOString();

        // 查询需要复习的词条
        // 条件：next_review_at <= now() 或 status = 'New'
        const { data: progressData, error: progressError } = await supabase
          .from('user_term_progress')
          .select(`
            term_id,
            status,
            next_review_at,
            terms!inner(
              id,
              term,
              definition,
              lesson_id,
              lessons!inner(
                id,
                name,
                deadline
              )
            )
          `)
          .eq('user_id', user.id)
          .or(`next_review_at.lte.${now},status.eq.New`)
          .order('next_review_at', { ascending: true, nullsFirst: true });

        if (progressError) {
          console.error('Error fetching progress:', progressError);
          throw new Error('Failed to fetch review terms');
        }

        if (!progressData) {
          setTerms([]);
          setLoading(false);
          return;
        }

        // 处理数据并过滤新词（限制每天新词数量）
        const newTermsLimit = 20; // 每天最多显示 20 个新词
        let newTermsCount = 0;
        const processedTerms: ReviewTerm[] = [];

        for (const progress of progressData) {
          const term = progress.terms as any;
          const lesson = term.lessons as any;
          
          // 如果是新词，检查是否超过限制
          if (progress.status === 'New' || !progress.next_review_at) {
            // 检查 lesson 是否有 deadline，以及 deadline 是否在未来
            const hasDeadline = lesson.deadline && new Date(lesson.deadline) > new Date();
            
            // 如果没有 deadline 或 deadline 尚早，限制新词数量
            if (!hasDeadline && newTermsCount >= newTermsLimit) {
              continue; // 跳过这个新词
            }
            
            newTermsCount++;
          }

          // 获取该词条的一个问题（用于跳转到学习页面）
          const { data: questionData } = await supabase
            .from('questions')
            .select('id')
            .eq('term_id', term.id)
            .limit(1)
            .single();

          processedTerms.push({
            term_id: term.id,
            term: term.term,
            definition: term.definition,
            lesson_id: lesson.id,
            lesson_name: lesson.name,
            status: progress.status,
            next_review_at: progress.next_review_at,
            question_id: questionData?.id || null,
          });
        }

        setTerms(processedTerms);
        setError(null);
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setTerms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGlobalReview();
  }, []);

  return { terms, loading, error };
}
```

### 使用示例

```typescript
import { useGlobalReview } from '@/hooks/useGlobalReview';

export default function GlobalReviewScreen() {
  const { terms, loading, error } = useGlobalReview();

  if (loading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <View>
      {terms.map((term) => (
        <TouchableOpacity
          key={term.term_id}
          onPress={() => {
            // 跳转到学习页面
            router.push(`/study/${term.lesson_id}`);
          }}
        >
          <Text>{term.term}</Text>
          <Text>{term.lesson_name}</Text>
          <Text>Status: {term.status}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

---

## Scenario B: 单课学习 (Lesson Specific Study)

目标：用户点进某个 Lesson，只想学这个 Lesson 的内容。

### 逻辑说明
- `lesson_id == [current_id]`
- `status = 'New'` 或 `next_review_at <= now()`
- 注意：在单课模式下，即使某些词还没完全到期（比如明天到期），如果用户想"提前学"，也可以考虑放宽筛选条件（例如 `next_review_at <= now() + 1 day`），或者是提供一个 "Review Ahead" 按钮。目前的默认逻辑先严格遵循 `<= now()`。

### 代码片段

```typescript
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';

interface LessonReviewTerm {
  term_id: string;
  term: string;
  definition: string;
  status: string;
  next_review_at: string | null;
  question_id: string | null;
}

/**
 * 单课学习 Hook
 * 获取指定课程中需要复习的词
 * @param lessonId 课程 ID
 * @param reviewAhead 是否提前复习（放宽筛选条件，包含明天到期的词）
 */
export function useLessonReview(lessonId: string, reviewAhead: boolean = false) {
  const [terms, setTerms] = useState<LessonReviewTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    const fetchLessonReview = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setError('User not authenticated');
          setLoading(false);
          return;
        }

        const now = new Date();
        // 如果启用提前复习，放宽到明天
        const reviewThreshold = reviewAhead 
          ? new Date(now.getTime() + 24 * 60 * 60 * 1000) // +1 day
          : now;
        
        const thresholdISO = reviewThreshold.toISOString();

        // 第一步：获取该 lesson 的所有 terms
        const { data: termsData, error: termsError } = await supabase
          .from('terms')
          .select('id, term, definition')
          .eq('lesson_id', lessonId);

        if (termsError) {
          console.error('Error fetching terms:', termsError);
          throw new Error('Failed to fetch terms');
        }

        if (!termsData || termsData.length === 0) {
          setTerms([]);
          setLoading(false);
          return;
        }

        const termIds = termsData.map((t) => t.id);

        // 第二步：查询用户进度
        const { data: progressData, error: progressError } = await supabase
          .from('user_term_progress')
          .select('term_id, status, next_review_at')
          .eq('user_id', user.id)
          .in('term_id', termIds);

        if (progressError) {
          console.error('Error fetching progress:', progressError);
          throw new Error('Failed to fetch progress');
        }

        // 第三步：构建进度映射
        const progressMap = new Map<string, { status: string; next_review_at: string | null }>();
        if (progressData) {
          progressData.forEach((p) => {
            progressMap.set(p.term_id, {
              status: p.status,
              next_review_at: p.next_review_at,
            });
          });
        }

        // 第四步：筛选需要复习的词条
        const reviewTerms: LessonReviewTerm[] = [];

        for (const term of termsData) {
          const progress = progressMap.get(term.id);
          const isNew = !progress || progress.status === 'New';
          const isDue = progress?.next_review_at 
            ? new Date(progress.next_review_at) <= reviewThreshold
            : false;

          // 筛选条件：新词或到期的词
          if (isNew || isDue) {
            // 获取该词条的一个问题
            const { data: questionData } = await supabase
              .from('questions')
              .select('id')
              .eq('term_id', term.id)
              .limit(1)
              .single();

            reviewTerms.push({
              term_id: term.id,
              term: term.term,
              definition: term.definition,
              status: progress?.status || 'New',
              next_review_at: progress?.next_review_at || null,
              question_id: questionData?.id || null,
            });
          }
        }

        // 第五步：排序（优先复习过期的）
        reviewTerms.sort((a, b) => {
          // 新词优先
          if (a.status === 'New' && b.status !== 'New') return -1;
          if (b.status === 'New' && a.status !== 'New') return 1;
          
          // 然后按 next_review_at 排序（较早的优先）
          if (!a.next_review_at && !b.next_review_at) return 0;
          if (!a.next_review_at) return -1;
          if (!b.next_review_at) return 1;
          
          return new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime();
        });

        setTerms(reviewTerms);
        setError(null);
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setTerms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLessonReview();
  }, [lessonId, reviewAhead]);

  return { terms, loading, error };
}
```

### 使用示例

```typescript
import { useLessonReview } from '@/hooks/useLessonReview';
import { useLocalSearchParams } from 'expo-router';

export default function LessonStudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reviewAhead, setReviewAhead] = useState(false);
  const { terms, loading, error } = useLessonReview(id || '', reviewAhead);

  if (loading) return <ActivityIndicator />;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <View>
      <TouchableOpacity onPress={() => setReviewAhead(!reviewAhead)}>
        <Text>Review Ahead: {reviewAhead ? 'ON' : 'OFF'}</Text>
      </TouchableOpacity>
      
      {terms.map((term) => (
        <TouchableOpacity
          key={term.term_id}
          onPress={() => {
            // 跳转到学习页面
            router.push(`/study/${id}`);
          }}
        >
          <Text>{term.term}</Text>
          <Text>Status: {term.status}</Text>
          {term.next_review_at && (
            <Text>Next Review: {new Date(term.next_review_at).toLocaleDateString()}</Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

---

## 注意事项

1. **性能优化**：如果词条数量很大，建议添加分页或限制每次查询的数量。

2. **缓存策略**：可以考虑使用 React Query 或 SWR 来缓存查询结果，减少不必要的 API 调用。

3. **实时更新**：如果需要在答题后实时更新列表，可以在答题成功后重新调用查询函数。

4. **错误处理**：确保妥善处理网络错误和权限错误。

5. **类型安全**：根据实际的数据结构调整 TypeScript 类型定义。

