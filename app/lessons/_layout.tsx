import { Stack } from 'expo-router';

export default function LessonsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        header: () => null,
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: false,
          header: () => null,
        }} 
      />
      <Stack.Screen 
        name="[id]" 
        options={{ 
          headerShown: false,
          header: () => null,
        }} 
      />
    </Stack>
  );
}

