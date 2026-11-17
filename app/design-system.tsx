import { Card } from '@/components/ui/Card';
import { EyeToggle } from '@/components/ui/EyeToggle';
import { Field } from '@/components/ui/Field';
import { SearchField } from '@/components/ui/SearchField';
/**
 * The design system, as the app actually runs it.
 *
 * Every value on this screen is read from theme/ and components/ui at render time,
 * so it cannot describe a system the app no longer has: change a token and this
 * page changes with it. It is the companion to the motion lab — that one answers
 * "how does it move", this one "what is it made of".
 *
 * Four pages: the colours, the type scale, the space and depth, and the components
 * themselves, each shown in every size and state it has. Where a thing has a rule
 * about when to use it, the rule is written next to it; a specimen with no rule is
 * how a system drifts.
 */

import { EdBase } from '@/components/EdBase';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { Icon } from '@/components/ui/Icon';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { BackButton, CloseButton, ConfirmButton } from '@/components/ui/RoundButtons';
import { safeBack } from '@/lib/safeBack';
import { chartColors } from '@/theme/colors';
import {
  colors, componentTokens, fonts, interaction,
  layout, radius, space, type as typeScale,
} from '@/theme';
import { ledge } from '@/theme/ledge';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Page = 'colour' | 'type' | 'space' | 'components';
const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'colour', label: 'Colour' },
  { id: 'type', label: 'Type' },
  { id: 'space', label: 'Space' },
  { id: 'components', label: 'Parts' },
];

/** A development tool. The route is an address, so in a release it leads home
 *  rather than simply being hidden from Settings. */
export default function DesignSystemRoute() {
  return __DEV__ ? <DesignSystemScreen /> : <Redirect href="/" />;
}

function DesignSystemScreen() {
  const [page, setPage] = useState<Page>('colour');
  return (
    <EdBase bottomInset={0} scroll={false}>
      <Stack.Screen options={{ gestureEnabled: true }} />
      <SecondaryPageNav onBack={() => safeBack('/profile')} />
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>Design system</Text>
        <Text style={styles.lead}>Read live from theme/ and components/ui. If it is not here, it is not a token yet.</Text>
        <View style={styles.tabs}>
          {PAGES.map((item) => (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: page === item.id }}
              onPress={() => setPage(item.id)} style={[styles.tab, page === item.id && styles.tabOn]}>
              <Text style={[styles.tabText, page === item.id && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {page === 'colour' && <ColourPage />}
        {page === 'type' && <TypePage />}
        {page === 'space' && <SpacePage />}
        {page === 'components' && <ComponentsPage />}
      </ScrollView>
    </EdBase>
  );
}

// ── Colour ──────────────────────────────────────────────────────
/** WCAG relative luminance, so a swatch can say what it is safe for rather than
 *  leaving it to be remembered. Mirrors scripts/check-ui.cjs. */
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  if (!/^#[\da-f]{6}$/i.test(a) || !/^#[\da-f]{6}$/i.test(b)) return null;
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every distinct colour the interface paints, grouped by what it is for.
 *
 * A value appears once, with all the names that resolve to it: `muted`, `sub` and
 * `accentText` are the same ink, and showing it three times would say the system
 * has three inks. Names are cheap; colours are not.
 *
 * What the drawings are painted in is deliberately absent — illustration colour is
 * not part of the system (theme/colors.ts keeps it in `referenceColors`, which no
 * screen reads).
 */
const ROLES: Array<{ title: string; rule: string; tokens: string[] }> = [
  {
    title: 'Ink',
    rule: 'What is written. Body copy holds 4.5:1 on every surface below; a placeholder is a hint, held to 3:1.',
    tokens: ['colors.text', 'colors.sub', 'colors.faint', 'colors.placeholder', 'colors.disabled', 'colors.onAction', 'colors.wordmark'],
  },
  {
    title: 'Surface',
    rule: 'What ink is written on. A card is surf; a panel inside it is panel; a ground tinted with the action colour is tint.',
    tokens: ['colors.bg', 'colors.surf', 'colors.panel', 'colors.tint', 'colors.line'],
  },
  {
    title: 'Action',
    rule: 'One purple presses. The deeper one is the shell under it, not a second brand colour.',
    tokens: ['colors.action', 'colors.actionShell'],
  },
  {
    title: 'State',
    rule: 'Right, wrong, careful, informative — each with the ground it is written on. Never replaced by the brand purple.',
    tokens: ['colors.green', 'colors.greenL', 'colors.red', 'colors.redL', 'colors.warn', 'colors.warnL', 'colors.info', 'colors.infoL'],
  },
  {
    title: 'Today',
    rule: 'The lime a page opens with, and the few colours the home screen and the charts add.',
    tokens: ['colors.lime', 'colors.limeBright', 'colors.limePale', 'colors.limeSurface',
      'colors.chartSoft', 'colors.chartBar', 'colors.swipeGreen', 'colors.swipeRed', 'colors.wrong'],
  },
];

const PALETTE: Record<string, string> = Object.fromEntries(
  Object.entries(colors).map(([k, v]) => [`colors.${k}`, String(v)]),
);
/** Every name in the runtime palette that resolves to this exact value. */
function namesFor(value: string) {
  return Object.entries(PALETTE).filter(([, v]) => v.toLowerCase() === value.toLowerCase()).map(([k]) => k);
}

function ColourPage() {
  // One swatch per value across the whole page, not per group.
  const shown = new Set<string>();
  return (
    <>
      <Note>One swatch per colour, with every name for it. Illustration colour is not shown: the drawings are painted from their own palette, which the interface never uses.</Note>
      {ROLES.map((role) => {
        const values = role.tokens
          .map((token) => PALETTE[token])
          .filter((value) => value && /^#[\da-f]{6}$/i.test(value) && !shown.has(value.toLowerCase()))
          .filter((value) => { shown.add(value.toLowerCase()); return true; });
        return (
          <Group key={role.title} title={role.title} rule={role.rule}>
            {values.map((value) => <Swatch key={value} value={value} />)}
            {role.title === 'Today' && <ChartRamp />}
          </Group>
        );
      })}
    </>
  );
}

/** The one ramp every chart on the You page reads from: the deeper the colour, the
 *  further along or the more of it. Its lightest step is the hairline colour — an
 *  empty cell is a ruled line, not a fifth tint of purple. */
function ChartRamp() {
  return (
    <View style={styles.specimen}>
      <View style={styles.ramp}>
        {chartColors.stages.map((step, i) => <View key={step + i} style={[styles.rampStep, { backgroundColor: step }]} />)}
      </View>
      <Text style={styles.swatchMeta}>chartColors.stages · {chartColors.stages.length} steps, learning to mastered</Text>
    </View>
  );
}

function Swatch({ value }: { value: string }) {
  const onWhite = contrast(value, colors.surf);
  const names = namesFor(value);
  return (
    <View style={styles.swatch}>
      <View style={[styles.paint, { backgroundColor: value }]} />
      <View style={styles.swatchCopy}>
        <Text style={styles.swatchName}>{names[0]}</Text>
        <Text style={styles.swatchMeta}>{value}{onWhite ? ` · ${onWhite.toFixed(2)}:1 on white` : ''}</Text>
        {names.length > 1 && <Text style={styles.swatchAlso}>also {names.slice(1).join(', ')}</Text>}
      </View>
    </View>
  );
}

// ── Type ────────────────────────────────────────────────────────
/** The roles worth looking at, in the order a screen uses them. The legacy aliases
 *  (`h1`, `display`, `micro`…) are deliberately not shown: they are kept for old
 *  call sites, not offered to new ones. */
/** The scale itself, in order. There is no curated subset any more: seven roles
 *  is the whole of it. */
const TYPE_ROLES = Object.keys(typeScale) as Array<keyof typeof typeScale>;

/** What each step is for. A specimen without a rule is where the next stray size
 *  comes from. */
const TYPE_USE: Record<keyof typeof typeScale, string> = {
  display: 'the one big number on a screen',
  title: 'a screen that is one statement',
  page: 'a screen title, a term being studied',
  heading: 'a section heading',
  body: 'reading copy, inputs, button labels',
  small: 'a subtitle, a hint, a second line',
  caption: 'a label, a chip, a count',
};

function TypePage() {
  return (
    <>
      <Note>Geist carries the interface; Oswald sets numbers and display. A size that is not a role here is a size nobody chose.</Note>
      <Group title="Roles" rule="Each is a decision about what the words are doing, not how big they looked that day.">
        {TYPE_ROLES.map((role) => {
          const style = typeScale[role];
          return (
            <View key={role} style={styles.typeRow}>
              <Text numberOfLines={1} style={[style, styles.typeSample]}>The quiet way in</Text>
              <Text style={styles.swatchMeta}>type.{role} · {style.fontSize}/{style.lineHeight} · {TYPE_USE[role]}</Text>
            </View>
          );
        })}
      </Group>
      <Group title="Families" rule="Four weights of one family, and one display face.">
        {(Object.entries(fonts) as Array<[string, string]>)
          .filter(([key]) => ['regular', 'medium', 'semibold', 'bold', 'display'].includes(key))
          .map(([key, family]) => (
            <View key={key} style={styles.typeRow}>
              <Text style={[styles.familySample, { fontFamily: family }]}>Aa · fonts.{key}</Text>
              <Text style={styles.swatchMeta}>{family}</Text>
            </View>
          ))}
      </Group>
    </>
  );
}

// ── Space and depth ─────────────────────────────────────────────
function SpacePage() {
  return (
    <>
      <Note>Spacing is the least settled part of the system: most screens still write their own numbers. These are what to reach for.</Note>
      <Group title="Scale" rule="space[n] for every gap, padding and margin. The keys count in fours: space[3] is three fours.">
        {(Object.entries(space) as Array<[string, number]>).sort((a, b) => a[1] - b[1]).map(([step, size]) => (
          <View key={step} style={styles.measureRow}>
            <View style={[styles.measure, { width: size }]} />
            <Text style={styles.swatchMeta}>space[{step}] · {size}</Text>
          </View>
        ))}
        <View style={styles.measureRow}>
          <View style={[styles.measure, { width: layout.screenInline }]} />
          <Text style={styles.swatchMeta}>layout.screenInline · {layout.screenInline} · every page's side margin</Text>
        </View>
      </Group>
      <Group title="Corners" rule="radius.lg for a card, radius.pill for anything pressable — a button, a chip, a progress bar.">
        {(['sm', 'md', 'lg', 'xl', 'pill'] as const).map((key) => (
          <View key={key} style={styles.measureRow}>
            <View style={[styles.corner, { borderRadius: radius[key] }]} />
            <Text style={styles.swatchMeta}>radius.{key} · {radius[key]}</Text>
          </View>
        ))}
      </Group>
      <Group title="Depth" rule="Every raised thing is a dark shell with a lighter face on it. The lip is how much the surface is asking for; pressing a button uses its lip up.">
        {(['lead', 'raised', 'control'] as const).map((depth) => (
          <View key={depth} style={styles.measureRow}>
            <View style={[styles.lipShell, { paddingBottom: ledge[depth] }]}><View style={styles.lipFace} /></View>
            <Text style={styles.swatchMeta}>ledge.{depth} · {ledge[depth]} · {LIP_USE[depth]}</Text>
          </View>
        ))}

      </Group>
    </>
  );
}

const LIP_USE = {
  lead: 'the one button a screen wants pressed',
  raised: 'a card that holds content',
  control: 'a chip, a toggle, a small action',
} as const;

// ── Components ──────────────────────────────────────────────────
const SIZES: ButtonSize[] = ['xl', 'lg', 'md', 'sm'];
const SIZE_USE: Record<ButtonSize, string> = {
  xl: 'a screen that is one decision — sign in, start out, subscribe',
  lg: 'the action a working screen wants — save, continue, start review',
  md: 'an action within a section — an empty state’s way out, a dialog',
  sm: 'a control beside something else — Go Pro, a row’s action',
};

function ComponentsPage() {
  const [variant, setVariant] = useState<ButtonVariant>('primary');
  const [chip, setChip] = useState('20');
  return (
    <>
      <Note>One button component (components/ui/Button). Before it there were forty-six, at eight heights and ten radii.</Note>
      <View style={styles.toggleRow}>
        {(['primary', 'secondary', 'ghost', 'quiet'] as ButtonVariant[]).map((item) => (
          <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: variant === item }}
            onPress={() => setVariant(item)} style={[styles.tab, variant === item && styles.tabOn]}>
            <Text style={[styles.tabText, variant === item && styles.tabTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Group title="Button sizes" rule="The size is what the button is for, not how much room there happens to be.">
        {SIZES.map((size) => (
          <View key={size} style={styles.specimen}>
            <Button size={size} variant={variant} label={`Button ${size}`} onPress={() => {}} />
            <Text style={styles.swatchMeta}>size="{size}" · {componentTokens.button[size].height}pt at rest under its lip · {SIZE_USE[size]}</Text>
          </View>
        ))}
      </Group>
      <Group title="Button states" rule="Pressing uses up the lip. Disabled dims the whole button rather than repainting it.">
        <View style={styles.specimen}>
          <Button size="md" variant={variant} label="With an icon" onPress={() => {}}
            icon={<Icon name="check" size={18} color={variant === 'primary' ? colors.onAction : colors.sub} />} />
          <Text style={styles.swatchMeta}>icon · a button in a row takes its label's width already</Text>
        </View>
        <View style={styles.specimen}>
          <Button size="md" variant={variant} label="Saving" loading onPress={() => {}} />
          <Text style={styles.swatchMeta}>loading · the label is replaced, the size is not</Text>
        </View>
        <View style={styles.specimen}>
          <Button size="md" variant={variant} label="Not yet" disabled onPress={() => {}} />
          <Text style={styles.swatchMeta}>disabled · opacity {componentTokens.button.disabledOpacity}</Text>
        </View>
      </Group>
      <Group title="Icon buttons" rule="One disc for every glyph you can press. The three in a page's bar — back, close, confirm — are the same component under different names.">
        <View style={styles.rowSpecimen}>
          <BackButton onPress={() => {}} label="Back" />
          <CloseButton onPress={() => {}} label="Close" />
          <ConfirmButton onPress={() => {}} label="Confirm" />
          <Text style={styles.swatchMeta}>components/ui/RoundButtons</Text>
        </View>
        <View style={styles.rowSpecimen}>
          {(['lg', 'md', 'sm'] as const).map((size) => (
            <IconButton key={size} size={size} variant={variant} label={`Icon button ${size}`} onPress={() => {}}>
              <Icon name="check" size={20} color={variant === 'primary' ? colors.onAction : colors.sub} />
            </IconButton>
          ))}
          <Text style={styles.swatchMeta}>{Object.entries(componentTokens.iconButton.size).map(([k, v]) => `${k} ${v}`).join(' · ')}</Text>
        </View>
      </Group>
      <Group title="Chips" rule="A thing to pick, not a thing to do. Softer corners than a button, and chosen means filled with the action colour.">
        <View style={styles.rowSpecimen}>
          {['10', '20', '30'].map((value) => (
            <Chip key={value} label={value} selected={chip === value} onPress={() => setChip(value)} />
          ))}
          <Text style={styles.swatchMeta}>components/ui/Chip · radius {componentTokens.chip.radius} against the button's {componentTokens.button.radius}</Text>
        </View>
      </Group>
      <Group title="Cards" rule={`A raised surface: a shell in the line colour with a lighter face on it, ${componentTokens.card.lip} points of the shell showing along the bottom. It is the same two layers as a button, held rather than pressed.`}>
        <View style={styles.specimen}>
          <Card><Text style={styles.cardText}>A card holds content. It does not move.</Text></Card>
          <Text style={styles.swatchMeta}>components/ui/Card · radius {componentTokens.card.radius.lg}, pad {componentTokens.card.pad.md}</Text>
        </View>
        <View style={styles.specimen}>
          <Card corner="xl" pad="lg"><Text style={styles.cardText}>corner=&quot;xl&quot;, for the tall ones a character perches on.</Text></Card>
          <Text style={styles.swatchMeta}>corner xl · radius {componentTokens.card.radius.xl}, pad {componentTokens.card.pad.lg}</Text>
        </View>
        <View style={styles.specimen}>
          <Card onPress={() => {}} accessibilityLabel="A card that opens something">
            <Text style={styles.cardText}>A card that opens something presses flat, like a button.</Text>
          </Card>
          <Text style={styles.swatchMeta}>onPress · it presses by the depth of its own lip</Text>
        </View>
        <View style={styles.specimen}>
          <Card selected><Text style={styles.cardText}>The chosen one of several.</Text></Card>
          <Text style={styles.swatchMeta}>selected · both layers take the action&apos;s colour</Text>
        </View>
      </Group>
      <Group title="Fields" rule={`A field is a well sunk into its card: ${componentTokens.field.minHeight} points tall, filled, hairlined. The label, the hint and the error belong to it, so they come with it.`}>
        <View style={styles.specimen}>
          <Field label="Label" placeholder="Placeholder text" hint="A hint, when one is needed." />
          <Text style={styles.swatchMeta}>components/ui/Field · colors.placeholder {colors.placeholder}</Text>
        </View>
        <View style={styles.specimen}>
          <Field label="Password" placeholder="Password" secureTextEntry
            trailing={<EyeToggle shown={false} onPress={() => {}} />} />
          <Text style={styles.swatchMeta}>trailing · what belongs inside the well on the right</Text>
        </View>
        <View style={styles.specimen}>
          <Field label="Definition" placeholder="A longer answer" multiline />
          <Text style={styles.swatchMeta}>multiline · {componentTokens.field.multilineMinHeight} points, text from the top</Text>
        </View>
        <View style={styles.specimen}>
          <Field label="Email" value="not-an-email" error="That does not look like an email address." />
          <Text style={styles.swatchMeta}>error · it replaces the hint and is announced</Text>
        </View>
        <View style={styles.specimen}>
          <View style={styles.rowSpecimen}>
            <SearchField label="Search lessons" value="" onChangeText={() => {}} />
          </View>
          <Text style={styles.swatchMeta}>components/ui/SearchField · radius {componentTokens.search.radius}, on the page rather than in a card</Text>
        </View>
      </Group>
      <Group title="Targets" rule={`Nothing pressable is smaller than ${interaction.minTarget} points.`}>
        <View style={styles.rowSpecimen}>
          <View style={styles.target} />
          <Text style={styles.swatchMeta}>interaction.minTarget · {interaction.minTarget}</Text>
        </View>
      </Group>
    </>
  );
}

// ── Page furniture ──────────────────────────────────────────────
function Group({ title, rule, children }: { title: string; rule: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.groupTitle}>{title}</Text>
      <Text style={styles.groupRule}>{rule}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <View style={styles.note}><Text style={styles.noteText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: layout.screenInline, paddingBottom: space[3], gap: space[1] },
  title: { ...typeScale.title, color: colors.text },
  lead: { ...typeScale.small, color: colors.sub },
  tabs: { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  toggleRow: { flexDirection: 'row', gap: space[2], marginBottom: space[4] },
  tab: { minHeight: interaction.minTarget, justifyContent: 'center', paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.panel },
  tabOn: { backgroundColor: colors.action },
  tabText: { ...typeScale.caption, color: colors.sub },
  tabTextOn: { color: colors.onAction },
  body: { paddingHorizontal: layout.screenInline, paddingBottom: space[10] },
  note: { padding: space[4], borderRadius: radius.lg, backgroundColor: colors.panel, marginBottom: space[5] },
  noteText: { ...typeScale.small, color: colors.sub },
  group: { marginBottom: space[8], gap: space[1] },
  groupTitle: { ...typeScale.heading, color: colors.text },
  groupRule: { ...typeScale.small, color: colors.sub },
  groupBody: { marginTop: space[3], gap: space[3] },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  paint: { width: 56, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  swatchCopy: { flex: 1, gap: space.hair },
  swatchName: { ...typeScale.caption, color: colors.text },
  swatchMeta: { ...typeScale.caption, color: colors.sub },
  swatchAlso: { ...typeScale.caption, color: colors.placeholder },
  typeRow: { gap: space.hair },
  typeSample: { color: colors.text },
  familySample: { ...typeScale.heading, color: colors.text },
  measureRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  measure: { height: 16, borderRadius: radius.sm, backgroundColor: colors.action },
  corner: { width: 56, height: 40, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  lipShell: { width: 56, height: 40, borderRadius: radius.md, backgroundColor: colors.actionShell },
  lipFace: { flex: 1, borderRadius: radius.md, backgroundColor: colors.action },
  specimen: { gap: space[1] },
  ramp: { flexDirection: 'row', height: 28, borderRadius: radius.sm, overflow: 'hidden' },
  rampStep: { flex: 1 },
  rowSpecimen: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
  cardText: { ...typeScale.small, color: colors.sub },
  target: { width: interaction.minTarget, height: interaction.minTarget, borderRadius: radius.md, borderWidth: 1, borderColor: colors.faint, backgroundColor: colors.panel },
});
