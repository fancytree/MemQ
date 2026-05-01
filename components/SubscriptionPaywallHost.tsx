import PaywallModal from '@/components/PaywallModal';
import { useSubscription } from '@/context/SubscriptionContext';
import React from 'react';

/**
 * 在 Provider 内挂载 PaywallModal，避免 SubscriptionContext ↔ PaywallModal 循环依赖
 */
export function SubscriptionPaywallHost() {
  const { showPaywallModal, setShowPaywallModal } = useSubscription();
  return <PaywallModal visible={showPaywallModal} onClose={() => setShowPaywallModal(false)} />;
}
