import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { mcpBrokerUrl as brokerBaseUrl } from '@/lib/mcp';
import { McpSetupSheet } from '@/components/McpSetupSheet';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { colors, fonts, layout } from '@/theme';
import { homeColors } from '@/theme/colors';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Connection = { id: string; name: string; createdAt: number };

async function brokerRequest(path: string, method = 'GET') {
  if (!brokerBaseUrl) throw new Error('Broker is not configured');
  const brokerUrl = new URL(brokerBaseUrl);
  const localDevelopment = __DEV__ && brokerUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(brokerUrl.hostname);
  if ((!localDevelopment && brokerUrl.protocol !== 'https:') || brokerUrl.username || brokerUrl.password || brokerUrl.search || brokerUrl.hash) {
    throw new Error('Invalid broker configuration');
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Sign in required');
  const response = await fetch(`${brokerBaseUrl}${path}`, {
    method, headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error('Connection request failed');
  return response;
}

export default function ConnectionsScreen() {
  const [grants, setGrants] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Connection | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setError(null); setGrants([]);
    try {
      const connections: Connection[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const response = await brokerRequest(`/connections${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        const data: { connections: Connection[]; nextCursor: string | null } = await response.json();
        connections.push(...data.connections);
        cursor = data.nextCursor;
        pages += 1;
        if (pages >= 20 && cursor) throw new Error('Too many connected apps');
      } while (cursor);
      if (sequence === loadSequence.current) setGrants(connections);
    } catch { if (sequence === loadSequence.current) setError('Couldn’t load connected apps. Please try again.'); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]));
  const revoke = async () => {
    if (!selected || revoking) return;
    setRevoking(true); setError(null);
    try {
      await brokerRequest(`/connections/${encodeURIComponent(selected.id)}`, 'DELETE');
      setGrants((current) => current.filter((grant) => grant.id !== selected.id));
      setSelected(null);
    } catch { setSelected(null); setError('Couldn’t disconnect this app. Please try again.'); }
    finally { setRevoking(false); }
  };
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.42, 1]} style={styles.gradient} />
    <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Connected apps</Text>
      <Text style={styles.intro}>Manage the apps you’ve connected to your MemQ account.</Text>
      {/* The half this screen was missing: it could show what was connected and take
          it away, but never said how to connect anything in the first place. */}
      <Pressable accessibilityRole="button" accessibilityLabel="How to connect an app"
        onPress={() => setShowHow(true)} style={styles.how}>
        <View style={styles.howIcon}><Feather name="help-circle" size={19} color={homeColors.deep} /></View>
        <Text style={styles.howText}>How to connect an app</Text>
        <Feather name="chevron-right" size={18} color={homeColors.muted} />
      </Pressable>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {loading ? <ActivityIndicator color={homeColors.primary} style={styles.loading} /> : error && grants.length === 0 ? <Pressable accessibilityRole="button" onPress={load} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable> : grants.length === 0 ? <View style={styles.empty}><Feather name="link" size={24} color={homeColors.deep} /><Text style={styles.emptyTitle}>No connected apps</Text><Text style={styles.emptyText}>Apps you authorize will appear here.</Text></View> : grants.map((grant) => <View key={grant.id} style={styles.card}>
        <View style={styles.cardTop}><View style={styles.icon}><Feather name="link" size={20} color={homeColors.deep} /></View><View style={styles.copy}><Text style={styles.name}>{grant.name || 'Connected app'}</Text><Text style={styles.meta}>Connected {new Date(grant.createdAt * 1000).toLocaleDateString()}</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${grant.name || 'connected app'}`} onPress={() => setSelected(grant)} style={styles.disconnect}><Text style={styles.disconnectText}>Disconnect</Text></Pressable>
      </View>)}
    </ScrollView>
    <McpSetupSheet visible={showHow} onClose={() => setShowHow(false)} />
    <ConfirmDialog visible={!!selected} title="Disconnect app?" subject={selected?.name || 'Connected app'} message="This app will need your permission again to connect." confirmLabel="Disconnect" loading={revoking} onCancel={() => setSelected(null)} onConfirm={revoke} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: homeColors.canvas },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 250 },
  content: { paddingHorizontal: layout.screenInline, paddingTop: 16, paddingBottom: 32, gap: 14 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 40, color: homeColors.deep },
  intro: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: homeColors.muted, marginBottom: 8 },
  how: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60,
    backgroundColor: homeColors.white, borderRadius: 24, paddingHorizontal: 14,
    boxShadow: `0px 4px 0px ${homeColors.border}`,
  },
  howIcon: {
    width: 40, height: 40, borderRadius: 13, backgroundColor: homeColors.selected,
    alignItems: 'center', justifyContent: 'center',
  },
  howText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: homeColors.deep },
  error: { color: colors.red, fontFamily: fonts.medium, fontSize: 14 },
  loading: { marginTop: 28 },
  empty: { alignItems: 'center', padding: 30, gap: 10 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 17, color: homeColors.deep },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, color: homeColors.muted, textAlign: 'center' },
  card: { backgroundColor: homeColors.white, borderRadius: 24, padding: 18, gap: 12, boxShadow: `0px 4px 0px ${homeColors.border}` },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: homeColors.selected, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: homeColors.deep },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: homeColors.muted },
  disconnect: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: 8 },
  disconnectText: { color: colors.red, fontFamily: fonts.semibold, fontSize: 14 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  retryText: { color: homeColors.primary, fontFamily: fonts.semibold, fontSize: 15 },
});
