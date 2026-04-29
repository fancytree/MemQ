import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useLoading } from '@/context/LoadingContext';

export default function AuthCheckScreen() {
  const { setLoading } = useLoading();

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // 无论是否有 session，都先隐藏启动页面
        setLoading(false);
        
        if (session) {
          // 如果有 session，重定向到主页面
          router.replace('/(tabs)');
        } else {
          // 如果没有 session，重定向到登录页面
          router.replace('/login');
        }
      } catch (error) {
        console.error('Error checking session:', error);
        // 如果出错，也隐藏启动页面并重定向到登录页面
        setLoading(false);
        router.replace('/login');
      }
    };

    checkSession();
  }, [setLoading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0a7ea4" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});

