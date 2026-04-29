/**
 * 数据库类型定义
 * 此文件定义了 Supabase 数据库表的 TypeScript 类型
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          is_pro: boolean;
          pro_expires_at: string | null;
          subscription_plan: 'monthly' | 'yearly' | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          is_pro?: boolean;
          pro_expires_at?: string | null;
          subscription_plan?: 'monthly' | 'yearly' | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          is_pro?: boolean;
          pro_expires_at?: string | null;
          subscription_plan?: 'monthly' | 'yearly' | null;
        };
      };
      lessons: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          deadline: string | null;
          is_vocab_mode: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          deadline?: string | null;
          is_vocab_mode?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          deadline?: string | null;
          is_vocab_mode?: boolean | null;
          created_at?: string;
        };
      };
      terms: {
        Row: {
          id: string;
          lesson_id: string;
          term: string;
          definition: string;
          explanation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          term: string;
          definition: string;
          explanation?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lesson_id?: string;
          term?: string;
          definition?: string;
          explanation?: string | null;
          created_at?: string;
        };
      };
      questions: {
        Row: {
          id: string;
          term_id: string;
          question_text: string;
          question_type: string;
          options: Json | null;
          correct_answer: string;
          explanation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          term_id: string;
          question_text: string;
          question_type?: string;
          options?: Json | null;
          correct_answer: string;
          explanation?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          term_id?: string;
          question_text?: string;
          question_type?: string;
          options?: Json | null;
          correct_answer?: string;
          explanation?: string | null;
          created_at?: string;
        };
      };
      user_term_progress: {
        Row: {
          id: string;
          user_id: string;
          term_id: string;
          status: 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
          step_index: number;
          next_review_at: string | null;
          last_reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          term_id: string;
          status?: 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
          step_index?: number;
          next_review_at?: string | null;
          last_reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          term_id?: string;
          status?: 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
          step_index?: number;
          next_review_at?: string | null;
          last_reviewed_at?: string | null;
          created_at?: string;
        };
      };
      chat_threads: {
        Row: {
          id: string;
          user_id: string;
          thread_id: string;
          title: string | null;
          mode: 'ask' | 'vocab_lookup' | 'practice' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          thread_id: string;
          title?: string | null;
          mode?: 'ask' | 'vocab_lookup' | 'practice' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          thread_id?: string;
          title?: string | null;
          mode?: 'ask' | 'vocab_lookup' | 'practice' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          user_id?: string;
          role?: 'user' | 'assistant';
          content?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      learning_stage: 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
    };
  };
}

// 导出常用的类型别名
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type Lesson = Database['public']['Tables']['lessons']['Row'];
export type LessonInsert = Database['public']['Tables']['lessons']['Insert'];
export type LessonUpdate = Database['public']['Tables']['lessons']['Update'];

export type Term = Database['public']['Tables']['terms']['Row'];
export type TermInsert = Database['public']['Tables']['terms']['Insert'];
export type TermUpdate = Database['public']['Tables']['terms']['Update'];

export type Question = Database['public']['Tables']['questions']['Row'];
export type QuestionInsert = Database['public']['Tables']['questions']['Insert'];
export type QuestionUpdate = Database['public']['Tables']['questions']['Update'];

export type UserTermProgress = Database['public']['Tables']['user_term_progress']['Row'];
export type UserTermProgressInsert = Database['public']['Tables']['user_term_progress']['Insert'];
export type UserTermProgressUpdate = Database['public']['Tables']['user_term_progress']['Update'];

export type ChatThread = Database['public']['Tables']['chat_threads']['Row'];
export type ChatThreadInsert = Database['public']['Tables']['chat_threads']['Insert'];
export type ChatThreadUpdate = Database['public']['Tables']['chat_threads']['Update'];

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update'];

// 订阅相关类型
export type SubscriptionPlan = 'monthly' | 'yearly' | null;

