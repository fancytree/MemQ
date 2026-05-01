/**
 * 启动加载页面状态管理
 * 用于控制启动页面的显示/隐藏
 */

import React, { createContext, useContext, useState } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
}

const noopSetLoading = (_loading: boolean) => {};
const LoadingContext = createContext<LoadingContextType>({
  isLoading: false,
  setLoading: noopSetLoading,
});

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <LoadingContext.Provider value={{ isLoading, setLoading: setIsLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingContext);
}
