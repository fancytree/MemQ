import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';
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
import { BackButton } from '@/components/ui/RoundButtons';
import { Sheet } from '@/components/ui/Sheet';
import { mcpServerUrl as serverUrl, setMcpGuidanceDismissed } from '@/lib/mcp';
import { space, radius, type, colors, fonts } from '@/theme';
import { layout } from '@/theme/spacing';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  const [dismissed, setDismissed] = useState(false);
  const [chosen, setChosen] = useState<Client | null>(null);

  const close = () => { setChosen(null); onClose(); };

  return (
    <Sheet visible={visible} onClose={close} align="center"
      onBack={() => (chosen ? setChosen(null) : close())}
      title={chosen ? chosen.name : 'From another app'}
      lead={chosen ? <BackButton onPress={() => setChosen(null)} label="Back to the list of apps" /> : undefined}>
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
    </Sheet>
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
      <Card gap={0}>
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
            <Icon name="chevronRight" size={18} color={colors.faint} />
          </Pressable>
        ))}
      </Card>

      <Text style={styles.later}>
        No rush. This lives in Settings under Connected apps, where you can also see
        what is connected and disconnect it.
      </Text>

      <Pressable accessibilityRole="button" accessibilityLabel="Open connected apps"
        onPress={() => { onConnected(); router.push('/profile/connections' as never); }}
        style={styles.link}>
        <Text style={styles.linkText}>Open Connected apps</Text>
        <Icon name="arrowRight" size={18} color={colors.action} />
      </Pressable>

      {offerDismiss && (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: dismissed }}
          accessibilityLabel="Don't show this again"
          onPress={() => onDismiss(!dismissed)}
          style={styles.dismissRow}>
          <View style={[styles.box, dismissed && styles.boxOn]}>
            {dismissed && <Icon name="check" size={15} color={colors.surf} />}
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
      <Card gap={0}>
        {steps.map((step, i) => (
          <View key={step.title} style={[styles.step, i > 0 && styles.stepGap]}>
            <View style={styles.number}><Text style={styles.numberText}>{i + 1}</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
          </View>
        ))}
      </Card>

      {!!serverUrl && (
        <Card gap={0}>
          <Text style={styles.addressLabel}>MemQ&apos;s address</Text>
          <Text selectable style={styles.address}>{serverUrl}</Text>
          <Text style={styles.addressHint}>Press and hold to copy.</Text>
        </Card>
      )}

      <View style={styles.noteRow}>
        <View style={styles.noteIcon}><Icon name="info" size={16} color={colors.faint} /></View>
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
  body: { paddingHorizontal: layout.screenInline, paddingBottom: space[6], gap: space[3] },
  intro: { ...type.small, color: colors.faint },
  sectionLabel: { ...type.body, fontFamily: fonts.semibold, marginTop: space.hair, color: colors.text },


  client: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52 },
  clientGap: { marginTop: space[3] },
  pressed: { opacity: 0.6 },
  mark: {
    width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.limeSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  clientCopy: { flex: 1, gap: space.hair },
  clientName: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  clientWhere: { ...type.small, color: colors.faint },

  step: { flexDirection: 'row', gap: space[3] },
  stepGap: { marginTop: space[4] },
  number: {
    width: 28, height: 28, borderRadius: radius.md, backgroundColor: colors.limeSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  numberText: { ...type.small, fontFamily: fonts.semibold, color: colors.sub },
  stepCopy: { flex: 1, gap: space.hair },
  stepTitle: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  stepBody: { ...type.small, color: colors.faint },

  addressLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  address: {
    ...type.small,
    marginTop: space[2],
    color: colors.sub,
  },
  addressHint: { ...type.caption, fontFamily: fonts.regular, marginTop: space[1], color: colors.faint },

  noteRow: { flexDirection: 'row', gap: space[2], paddingHorizontal: space.hair },
  noteIcon: { marginTop: space.hair },
  note: { ...type.small, flex: 1, color: colors.faint },

  later: {
    ...type.small,
    marginTop: space.hair,
    color: colors.faint,
  },

  dismissRow: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[2],
    alignSelf: 'center', paddingHorizontal: space[1],
  },
  box: {
    width: 24, height: 24, borderRadius: radius.sm, borderWidth: 2,
    borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: colors.action, backgroundColor: colors.action },
  dismissText: { ...type.small, color: colors.faint },

  link: {
    marginTop: space.hair, minHeight: 50, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: space[2],
  },
  linkText: { ...type.small, fontFamily: fonts.semibold, color: colors.action },
});
