import CreateTerm from '@/components/CreateTerm';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function AddTermsScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();

  if (!lessonId) {
    return null;
  }

  return <CreateTerm lessonId={lessonId} />;
}

