import { Redirect } from 'expo-router';
import React from 'react';

export default function NotFoundScreen() {
  return <Redirect href="/" />;
}
