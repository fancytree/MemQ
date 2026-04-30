import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_ACTIVE = [true, true, true, true, false, false, false] as const;

interface QuadStat {
  label: string;
  val: string;
  sub: string;
}

const STATS_TOP: QuadStat[] = [
  { label: 'Accuracy',     val: '84%', sub: 'avg across all decks' },
  { label: 'Certificates', val: '3',   sub: 'completed' },
];
const STATS_BOTTOM: QuadStat[] = [
  { label: 'Global rank', val: '#12', sub: 'this week' },
  { label: 'Focus queue', val: '5',   sub: 'cards due today' },
];

export default function ProfileScreen() {
  const [displayName, setDisplayName] = useState('User');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fromMeta = user.user_metadata?.full_name as string | undefined;
      const fromEmail = user.email?.split('@')[0];
      const name = (fromMeta?.trim() || fromEmail || 'User').trim();
      setDisplayName(name);

      const avatarPath = user.user_metadata?.avatar_url as string | undefined;
      if (!avatarPath) {
        setAvatarUrl(null);
        return;
      }

      if (avatarPath.startsWith('http')) {
        setAvatarUrl(avatarPath);
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
      setAvatarUrl(data.publicUrl || null);
    };
    loadUserProfile();
  }, []);

  const avatarInitial = useMemo(() => displayName.charAt(0).toUpperCase() || 'U', [displayName]);

  return (
    <EdBase>
      {/* Identity bar */}
      <View style={styles.idBar}>
        <Text style={styles.idName}>{displayName}</Text>
        <Text style={styles.idLevel}>Level 14</Text>
      </View>

      {/* Avatar row */}
      <View style={styles.avatarRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarChar}>{avatarInitial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.avName}>{displayName}</Text>
          <Text style={styles.avMeta}>Member since Jan 2025</Text>
        </View>
        <Pressable onPress={() => router.push('/profile')}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>

      {/* Streak */}
      <View style={styles.streakBlock}>
        <SectionLabel size={11} style={{ marginBottom: 12, fontFamily: 'JetBrainsMono_500', fontWeight: '400', lineHeight: 15 }}>
          Current Streak
        </SectionLabel>
        <View style={styles.streakLine}>
          <Text style={styles.streakNum}>47</Text>
          <Text style={styles.streakUnit}>days</Text>
          <Text style={[styles.streakUnit, { marginLeft: 'auto' }]}>Best: 61</Text>
        </View>

        {/* Day cells */}
        <View style={styles.daysRow}>
          {DAY_LABELS.map((d, i) => {
            const active = DAY_ACTIVE[i];
            return (
              <View key={i} style={styles.dayCell}>
                <View
                  style={[
                    styles.daySquare,
                    {
                      backgroundColor: active ? colors.accent : colors.bg,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                />
                <Text style={styles.dayLabel}>{d}</Text>
              </View>
            );
          })}
        </View>

        {/* Goal bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: '78%' }]} />
        </View>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>78% to monthly goal</Text>
          <Text style={styles.barLabel}>Goal: 60 days</Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.gridBlock}>
        <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          {STATS_TOP.map((item, i) => (
            <StatCell key={item.label} item={item} hasBorder={i === 0} />
          ))}
        </View>
        <View style={styles.gridRow}>
          {STATS_BOTTOM.map((item, i) => (
            <StatCell key={item.label} item={item} hasBorder={i === 0} />
          ))}
        </View>
      </View>

    </EdBase>
  );
}

function StatCell({ item, hasBorder }: { item: QuadStat; hasBorder: boolean }) {
  return (
    <View
      style={[
        styles.statCell,
        hasBorder && { borderRightWidth: 1, borderRightColor: colors.border },
      ]}
    >
      <SectionLabel
        size={11}
        style={{ marginBottom: 6, fontFamily: 'JetBrainsMono_500', fontWeight: '400', lineHeight: 15 }}
      >
        {item.label}
      </SectionLabel>
      <Text style={styles.statVal}>{item.val}</Text>
      <Text style={styles.statSub}>{item.sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  idBar: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  idName:  { fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: colors.text, fontFamily: fonts.grotesk },
  idLevel: { fontSize: 12, color: colors.muted, fontFamily: fonts.grotesk },

  avatarRow: {
    paddingHorizontal: 20, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarChar: { color: '#fff', fontSize: 18, fontWeight: '700', fontFamily: fonts.grotesk },
  avName: {
    fontSize: 20,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
    lineHeight: 28,
    letterSpacing: -0.1,
    color: colors.text,
  },
  avMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 2,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  editLink: {
    fontSize: 13,
    letterSpacing: -0.1,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },

  streakBlock: {
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  streakLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakNum: {
    fontSize: 56,
    fontFamily: 'JetBrainsMono_800',
    fontWeight: '400',
    letterSpacing: -0.16,
    lineHeight: 60,
    paddingTop: 2,
    color: colors.text,
  },
  streakUnit: { fontSize: 14, color: colors.muted, fontFamily: fonts.grotesk },

  daysRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dayCell: { flex: 1, alignItems: 'center', gap: 6 },
  daySquare: {
    width: '100%', aspectRatio: 1,
    borderRadius: 4, borderWidth: 1.5,
  },
  dayLabel: { fontSize: 9, color: colors.muted, fontWeight: '500', fontFamily: fonts.grotesk },

  barTrack: { height: 2, borderRadius: 1, backgroundColor: colors.dim, marginTop: 14, overflow: 'hidden' },
  barFill:  { height: '100%', backgroundColor: colors.accent },
  barRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  barLabel: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },

  gridBlock: { backgroundColor: colors.surf, borderBottomWidth: 1, borderBottomColor: colors.border },
  gridRow:   { flexDirection: 'row' },
  statCell:  { flex: 1, paddingHorizontal: 18, paddingVertical: 16 },
  statVal: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 32,
    fontWeight: '400',
    letterSpacing: -0.1,
    lineHeight: 36,
    paddingTop: 2,
    color: colors.text,
  },
  statSub: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 4,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },

});
