import { Stack } from 'expo-router';

export default function LessonDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // 默认隐藏，各个页面自己控制
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: false, // 使用自定义 header
        }} 
      />
      <Stack.Screen 
        name="add-terms" 
        options={{ 
          headerShown: false, // add-terms 页面自己管理 header
        }} 
      />
    </Stack>
  );
}

