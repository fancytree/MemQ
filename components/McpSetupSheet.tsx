/**
 * How to make lessons from somewhere else.
 *
 * MemQ can be connected to an app that speaks MCP, which can then create lessons
 * and cards in this account. Connected apps (under Settings) lists what is
 * connected and lets you disconnect — but nothing anywhere said how to connect in
 * the first place, which is the half a person actually needs.
 *
 * It asks which app first, then shows that app's own sequence. One list of every
 * path at once reads as a comparison chart; nobody connecting Claude needs to be
 * told what ChatGPT calls its menu, and the steps genuinely differ — one of them
 * has to be switched on before it will show you the setting at all.
 *
 * It is shown from New Lesson, behind the same EXPO_PUBLIC_MCP_ENABLED flag that
 * hides Connected apps, so it appears only in a build where connecting works.
 */

import { BrandMark, type BrandName } from '@/components/ui/BrandMark';
import { BackButton, CloseButton } from '@/components/ui/RoundButtons';
import { mcpServerUrl as serverUrl, setMcpGuidanceDismissed } from '@/lib/mcp';
import { fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { sheet } from '@/theme/sheet';
import { layout } from '@/theme/spacing';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Step = { title: string; body: string };

type Client = {
  name: string;
  mark: BrandName;
  /** The one line that stands for it in the list. */
  where: string;
  steps: Step[];
  /** What would otherwise waste somebody's afternoon. */
  note: string;
};

/** The last two steps are the same wherever you start from: the approval happens
 *  here, and then you ask. Only the first step is really that app's own. */
const AFTER: Step[] = [
  {
    title: 'Sign in and approve',
    body: 'It sends you here to sign in to MemQ and say yes. Nothing is shared until you do.',
  },
  {
    title: 'Ask it for a lesson',
    body: 'Say what you want to learn. The lesson and its cards show up in your library.',
  },
];

const address = serverUrl ? 'the address below' : "MemQ's address";

/** Where to look in each app — not a claim that any of them has been tested against
 *  this server. docs/mcp/README.md is explicit that no such claim is made yet.
 *
 *  These menus get renamed and the plan rules move, which each screen says in its
 *  own words rather than pretending otherwise. */
const CLIENTS: Client[] = [
  {
    name: 'Claude',
    mark: 'claude',
    where: 'Settings › Connectors',
    steps: [
      {
        title: 'Settings › Connectors',
        body: `Choose Add custom connector and give it ${address}.`,
      },
    ],
    note: 'Claude reaches the server from its own machines rather than from your phone, so the address has to be one the public internet can reach.',
  },
  {
    name: 'ChatGPT',
    mark: 'openai',
    where: 'Settings › Apps & Connectors',
    steps: [
      {
        title: 'Turn on Developer mode first',
        body: 'Settings › Apps & Connectors › Advanced. Without it the next step is not there to find.',
      },
      {
        title: 'Apps & Connectors › Create',
        body: `Give it ${address}.`,
      },
    ],
    note: 'Not every plan may add its own connector, and on a work account an admin may have to allow it first. If Developer mode is missing, that is usually why.',
  },
  {
    name: 'Cursor, VS Code and others',
    mark: 'editors',
    where: 'Its own MCP settings',
    steps: [
      {
        title: 'Add a remote MCP server',
        body: `In the editor's MCP settings, add a remote (HTTP) server with ${address}.`,
      },
    ],
    note: 'It has to be the remote kind. A local, command-line MCP entry runs a program on your own machine and will never reach MemQ.',
  },
];

export function McpSetupSheet({ visible, onClose, offerDismiss = false }: {
  visible: boolean;
  onClose: () => void;
  /** Shown when it opened by itself: the way to stop it doing that. */
  offerDismiss?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  const [chosen, setChosen] = useState<Client | null>(null);

  const close = () => { setChosen(null); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      onRequestClose={() => (chosen ? setChosen(null) : close())}>
      <View style={sheet.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close"
          style={StyleSheet.absoluteFill} onPress={close} />
        <View accessibilityViewIsModal style={[styles.surface, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={sheet.handle} />
          <View style={sheet.head}>
            {chosen
              ? <BackButton onPress={() => setChosen(null)} label="Back to the list of apps" />
              : <View style={styles.headSpacer} />}
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
              {chosen ? chosen.name : 'From another app'}
            </Text>
            <CloseButton onPress={close} label="Close" />
          </View>

          {chosen
            ? <Detail client={chosen} />
            : (
              <List
                onChoose={setChosen}
                offerDismiss={offerDismiss}
                dismissed={dismissed}
                onDismiss={(next) => { setDismissed(next); void setMcpGuidanceDismissed(next); }}
                onConnected={close}
              />
            )}
        </View>
      </View>
    </Modal>
  );
}

function List({ onChoose, offerDismiss, dismissed, onDismiss, onConnected }: {
  onChoose: (client: Client) => void;
  offerDismiss: boolean;
  dismissed: boolean;
  onDismiss: (next: boolean) => void;
  onConnected: () => void;
}) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
      <Text style={styles.intro}>
        MemQ can be connected to an app that writes lessons for you — one that speaks
        MCP, like Claude. Ask it for a lesson there and the cards land here.
      </Text>

      <Text style={styles.sectionLabel}>Which app are you using?</Text>
      <View style={styles.card}><View style={styles.cardFace}>
        {CLIENTS.map((client, i) => (
          <Pressable key={client.name} accessibilityRole="button"
            accessibilityLabel={`How to connect ${client.name}`}
            onPress={() => onChoose(client)}
            style={({ pressed }) => [styles.client, i > 0 && styles.clientGap, pressed && styles.pressed]}>
            <View style={styles.mark}><BrandMark name={client.mark} /></View>
            <View style={styles.clientCopy}>
              <Text style={styles.clientName}>{client.name}</Text>
              <Text style={styles.clientWhere}>{client.where}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={homeColors.muted} />
          </Pressable>
        ))}
      </View></View>

      <Text style={styles.later}>
        No rush. This lives in Settings under Connected apps, where you can also see
        what is connected and disconnect it.
      </Text>

      <Pressable accessibilityRole="button" accessibilityLabel="Open connected apps"
        onPress={() => { onConnected(); router.push('/profile/connections' as never); }}
        style={styles.link}>
        <Text style={styles.linkText}>Open Connected apps</Text>
        <Feather name="arrow-right" size={18} color={homeColors.primary} />
      </Pressable>

      {offerDismiss && (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: dismissed }}
          accessibilityLabel="Don't show this again"
          onPress={() => onDismiss(!dismissed)}
          style={styles.dismissRow}>
          <View style={[styles.box, dismissed && styles.boxOn]}>
            {dismissed && <Feather name="check" size={15} color={homeColors.white} />}
          </View>
          <Text style={styles.dismissText}>Don&apos;t show this again</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Detail({ client }: { client: Client }) {
  const steps = [...client.steps, ...AFTER];
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
      <View style={styles.card}><View style={styles.cardFace}>
        {steps.map((step, i) => (
          <View key={step.title} style={[styles.step, i > 0 && styles.stepGap]}>
            <View style={styles.number}><Text style={styles.numberText}>{i + 1}</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View></View>

      {!!serverUrl && (
        <View style={styles.card}><View style={styles.cardFace}>
          <Text style={styles.addressLabel}>MemQ&apos;s address</Text>
          <Text selectable style={styles.address}>{serverUrl}</Text>
          <Text style={styles.addressHint}>Press and hold to copy.</Text>
        </View></View>
      )}

      <View style={styles.noteRow}>
        <Feather name="info" size={16} color={homeColors.muted} style={styles.noteIcon} />
        <Text style={styles.note}>{client.note}</Text>
      </View>

      <Text style={styles.later}>
        If the wording has moved — these menus get renamed — look for connectors, apps
        or MCP in that app&apos;s settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  surface: { ...sheet.surface, maxHeight: '86%', paddingTop: 0 },
  headSpacer: { width: 44 },
  title: {
    flex: 1, textAlign: 'center',
    fontFamily: fonts.display, fontSize: 23, lineHeight: 32, color: homeColors.deep,
  },

  body: { paddingHorizontal: layout.screenInline, paddingBottom: 28, gap: 12 },
  intro: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: homeColors.muted },
  sectionLabel: {
    marginTop: 2, fontFamily: fonts.semibold, fontSize: 16, color: homeColors.darkest,
  },

  card: { borderRadius: 28, backgroundColor: homeColors.border, paddingBottom: ledge.raised },
  cardFace: { borderRadius: 28, backgroundColor: homeColors.white, padding: 18 },

  client: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  clientGap: { marginTop: 14 },
  pressed: { opacity: 0.6 },
  mark: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: homeColors.selected,
    alignItems: 'center', justifyContent: 'center',
  },
  clientCopy: { flex: 1, gap: 2 },
  clientName: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: homeColors.darkest },
  clientWhere: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: homeColors.muted },

  step: { flexDirection: 'row', gap: 14 },
  stepGap: { marginTop: 18 },
  number: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: homeColors.selected,
    alignItems: 'center', justifyContent: 'center',
  },
  numberText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.deep },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: homeColors.darkest },
  stepBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: homeColors.muted },

  addressLabel: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.darkest },
  address: {
    marginTop: 8, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21,
    color: homeColors.deep,
  },
  addressHint: { marginTop: 6, fontFamily: fonts.regular, fontSize: 13, color: homeColors.muted },

  noteRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 2 },
  noteIcon: { marginTop: 2 },
  note: {
    flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: homeColors.muted,
  },

  later: {
    marginTop: 2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21,
    color: homeColors.muted,
  },

  dismissRow: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
    alignSelf: 'center', paddingHorizontal: 4,
  },
  box: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 2,
    borderColor: homeColors.border, alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: homeColors.primary, backgroundColor: homeColors.primary },
  dismissText: { fontFamily: fonts.regular, fontSize: 14, color: homeColors.muted },

  link: {
    marginTop: 2, minHeight: 50, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.primary },
});
