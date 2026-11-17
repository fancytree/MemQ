import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MascotState } from '@/components/mascot/MascotState';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { mcpBrokerUrl as brokerBaseUrl } from '@/lib/mcp';
import { McpSetupSheet } from '@/components/McpSetupSheet';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { space, radius, type, colors, fonts, layout } from '@/theme';
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
    // No broker means this build cannot list anything — which is not a failure to
    // retry, so it does not get the error that asks people to try again.
    if (!brokerBaseUrl) { setLoading(false); setError(null); setGrants([]); return; }
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
    <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.42, 1]} style={styles.gradient} />
    <SecondaryPageNav onBack={() => safeBack('/profile/settings')} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Connected apps</Text>
      <Text style={styles.intro}>Manage the apps you’ve connected to your MemQ account.</Text>
      {/* The half this screen was missing: it could show what was connected and take
          it away, but never said how to connect anything in the first place. */}
      <Card onPress={() => setShowHow(true)} accessibilityLabel="How to connect an app"
        pad="sm" faceStyle={styles.how}>
        <View style={styles.howIcon}><Icon name="help" color={colors.sub} /></View>
        <Text style={styles.howText}>How to connect an app</Text>
        <Icon name="chevronRight" size={18} color={colors.faint} />
      </Card>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {loading ? <ActivityIndicator color={colors.action} style={styles.loading} /> : error && grants.length === 0 ? <View style={styles.empty}><MascotState kind="error" width={148} /><Pressable accessibilityRole="button" onPress={load} style={[styles.retry, styles.retryCentered]}><Text style={styles.retryText}>Try again</Text></Pressable></View> : grants.length === 0 ? <View style={styles.empty}><MascotState kind="empty" width={148} /><Text style={styles.emptyTitle}>{brokerBaseUrl ? 'No connected apps' : 'Not available yet'}</Text><Text style={styles.emptyText}>{brokerBaseUrl ? 'Apps you authorize will appear here.' : 'Connecting isn’t switched on in this build. The steps above are what it will look like.'}</Text></View> : grants.map((grant) => <Card key={grant.id}>
        <View style={styles.cardTop}><View style={styles.icon}><Icon name="connections" color={colors.sub} /></View><View style={styles.copy}><Text style={styles.name}>{grant.name || 'Connected app'}</Text><Text style={styles.meta}>Connected {new Date(grant.createdAt * 1000).toLocaleDateString()}</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${grant.name || 'connected app'}`} onPress={() => setSelected(grant)} style={styles.disconnect}><Text style={styles.disconnectText}>Disconnect</Text></Pressable>
      </Card>)}
    </ScrollView>
    <McpSetupSheet visible={showHow} onClose={() => setShowHow(false)} />
    <ConfirmDialog visible={!!selected} title="Disconnect app?" subject={selected?.name || 'Connected app'} message="This app will need your permission again to connect." confirmLabel="Disconnect" loading={revoking} onCancel={() => setSelected(null)} onConfirm={revoke} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 250 },
  content: { paddingHorizontal: layout.screenInline, paddingTop: space[4], paddingBottom: space[8], gap: space[3] },
  title: { ...oneLine(type.title), color: colors.sub },
  intro: { ...type.small, color: colors.faint, marginBottom: space[2] },
  how: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 54 },
  howIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.limeSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  howText: { ...type.body, fontFamily: fonts.semibold, flex: 1, color: colors.sub },
  error: { ...type.small, fontFamily: fonts.medium, color: colors.red },
  loading: { marginTop: space[6] },
  empty: { alignItems: 'center', padding: space[8], gap: space[2] },
  emptyTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.sub },
  emptyText: { ...type.small, color: colors.faint, textAlign: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  icon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.limeSurface, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: space.hair },
  name: { ...type.body, fontFamily: fonts.semibold, color: colors.sub },
  meta: { ...type.caption, fontFamily: fonts.regular, color: colors.faint },
  disconnect: { minHeight: 44, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: space[2] },
  disconnectText: { ...type.small, fontFamily: fonts.semibold, color: colors.red },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  retryCentered: { alignSelf: 'center' },
  retryText: { ...type.small, fontFamily: fonts.semibold, color: colors.action },
});
