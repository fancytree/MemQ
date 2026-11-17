import { Card } from '@/components/ui/Card';
import { space, radius } from '@/theme/spacing';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { CountUp, GROW_MS, useEased } from '@/components/motion/Grow';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { STAGES, type Stage } from '@/lib/scheduler';
import { colors, chartColors } from '@/theme/colors';
import { type, fonts } from '@/theme/typography';

/** The You page's charts.
 *
 * Each is a white card with a lip, like everything else that holds content here,
 * led by one large number and one short line that says what the chart shows —
 * the chart is there to back the sentence up, not to be read like a spreadsheet.
 * One purple ramp runs through all of them (theme chartColors): the deeper, the
 * further along or the more of it.
 *
 * The numbers arrive after the page does, so each chart is drawn empty first and
 * then grows into what it has to say: bars rise from their foot one after another,
 * the stage bar fills from the left, the accuracy line draws itself, studied days
 * come up across the grid, and the large numbers count to their value. It happens
 * when the numbers change, not every time the page is looked at — coming back to
 * the same numbers shows them still. With reduced motion everything is simply there.
 */

const STAGGER_MS = 45;

/** A bar that rises from its foot to `height`. */
function GrowBar({ height, delay, style }: { height: number; delay: number; style: StyleProp<ViewStyle> }) {
  const grown = useEased(height, delay);
  const rise = useAnimatedStyle(() => ({ height: grown.value }));
  return <Animated.View style={[style, rise]} />;
}

/** A large figure: counted up when it is a number (or a percentage), as it is
 * otherwise — a dash, say. */
function Figure({ value }: { value: string }) {
  const match = /^(\d+)(%?)$/.exec(value);
  if (!match) return <>{value}</>;
  return <><CountUp value={Number(match[1])} style={styles.value} />{match[2]}</>;
}

export function ChartCard({ label, value, unit, note, children }: {
  label: string; value: string; unit?: string; note?: string; children: ReactNode;
}) {
  return (
    <Card gap={space[4]}>
      <View style={styles.head}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}><Figure value={value} />{!!unit && <Text style={styles.unit}> {unit}</Text>}</Text>
        {!!note && <Text style={styles.note}>{note}</Text>}
      </View>
      {children}
    </Card>
  );
}

// ── Where the cards are ─────────────────────────────────────────

/** Every card, in one bar, by the stage it has reached. */
export function StageBar({ counts }: { counts: Record<Stage, number> }) {
  const total = STAGES.reduce((sum, stage) => sum + counts[stage], 0);
  const [width, setWidth] = useState(0);
  // Filled from the left: the segments are laid out at full width and uncovered.
  const shown = useEased(total > 0 ? 1 : 0, 0, GROW_MS + 200);
  const uncover = useAnimatedStyle(() => ({ width: width * shown.value }));
  return (
    <View style={styles.stageWrap}>
      <View style={styles.stageBar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible accessibilityLabel={STAGES.map((s) => `${counts[s]} ${s}`).join(', ')}>
        <Animated.View style={[styles.stageReveal, uncover]}>
          <View style={[styles.stageSegments, { width }]}>
            {STAGES.map((stage, i) => counts[stage] > 0 && (
              <View key={stage} style={[styles.stageSegment, { flex: counts[stage], backgroundColor: chartColors.stages[i] }]} />
            ))}
          </View>
        </Animated.View>
      </View>
      <View style={styles.legend}>
        {STAGES.map((stage, i) => (
          <View key={stage} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: chartColors.stages[i] }]} />
            <Text style={styles.legendName}>{stage}</Text>
            <CountUp value={counts[stage]} style={styles.legendCount} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── What is coming ──────────────────────────────────────────────

const COLUMN_HEIGHT = 92;

/** Cards due on each of the next days. Today is drawn deepest; the busiest day
 * after it is marked with its number. */
export function ForecastChart({ counts, labels }: { counts: number[]; labels: string[] }) {
  const most = Math.max(1, ...counts);
  return (
    <View style={styles.columns}>
      {counts.map((count, i) => (
        <View key={i} style={styles.column} accessible accessibilityLabel={`${labels[i]}, ${count} due`}>
          <CountUp value={count} style={[styles.columnCount, count === 0 && styles.columnCountNone]} />
          <View style={styles.columnTrack}>
            <GrowBar delay={i * STAGGER_MS} height={count === 0 ? 4 : Math.max(8, (count / most) * COLUMN_HEIGHT)}
              style={[styles.columnBar, {
                backgroundColor: count === 0 ? chartColors.empty : i === 0 ? colors.action : chartColors.stages[2],
              }]} />
          </View>
          <Text style={[styles.columnLabel, i === 0 && styles.columnLabelToday]}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  );
}

// ── When you studied ────────────────────────────────────────────

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const CELL = 20;

/** The last few weeks, a row a week with this one at the bottom, Monday first —
 * read the way a calendar is, without the dates. A tile's shade is how much was
 * studied that day (0–4, from `levels`); today has a ring; the days of this week
 * still to come are left out.
 *
 * Small on purpose. It sits beside the streak it explains, and what it has to show
 * is the run of days and where it broke, which a few weeks of tiles show at a
 * glance. A month of numbered days took the height of the rest of the page.
 */
export function WeekGrid({ levels, weeks = 5 }: { levels: Map<string, number>; weeks?: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = keyOf(today);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  const rows = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + w * 7 + d);
    return day;
  }));
  const studied = [...levels.entries()].filter(([key, level]) => level > 0 && key >= keyOf(monday) && key <= todayKey).length;

  return (
    <View style={styles.grid} accessible accessibilityLabel={`Studied on ${studied} of the last ${weeks} weeks' days`}>
      <View style={styles.gridRow}>
        {WEEKDAYS.map((d, i) => <Text key={i} style={styles.weekday}>{d}</Text>)}
      </View>
      {rows.map((row, w) => (
        <View key={w} style={styles.gridRow}>
          {row.map((day, d) => {
            const key = keyOf(day);
            if (key > todayKey) return <View key={d} style={styles.tile} />;
            return <Tile key={d} level={levels.get(key) ?? 0} today={key === todayKey} delay={(w + d) * 28} />;
          })}
        </View>
      ))}
    </View>
  );
}

/** One day. Its shade comes up from the middle of the tile, in a wave across the
 * grid from the top left, so the run of studied days is seen arriving in order. */
function Tile({ level, today, delay }: { level: number; today: boolean; delay: number }) {
  const shown = useEased(level > 0 ? 1 : 0, delay, 380);
  const pop = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: 0.5 + 0.5 * shown.value }] }));
  return (
    <View style={[styles.tile, { backgroundColor: chartColors.heat[0] }, today && styles.tileToday]}>
      {level > 0 && <Animated.View style={[styles.tileFill, { backgroundColor: chartColors.heat[level] }, pop]} />}
    </View>
  );
}

// ── How much, against the goal ──────────────────────────────────

const PLOT_HEIGHT = 96;

/** Cards studied each day, with the daily goal drawn across. A day that reached the
 * goal is filled in; one that did not is drawn lighter. */
export function GoalChart({ values, labels, goal }: { values: number[]; labels: string[]; goal: number }) {
  const [width, setWidth] = useState(0);
  // The goal is drawn across once the bars have risen to meet it.
  const goalShown = useEased(1, values.length * 30 + 200, 300);
  const goalFade = useAnimatedStyle(() => ({ opacity: goalShown.value }));
  const top = Math.max(goal * 1.25, ...values, 1);
  const goalY = PLOT_HEIGHT - (goal / top) * PLOT_HEIGHT;
  return (
    <View>
      <View style={styles.plot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.goalBars}>
          {values.map((v, i) => (
            <View key={i} style={styles.goalSlot} accessible accessibilityLabel={`${labels[i]}, ${v} cards`}>
              <GrowBar delay={i * 30} height={v === 0 ? 3 : Math.max(5, (v / top) * PLOT_HEIGHT)}
                style={[styles.goalBar, {
                  backgroundColor: v === 0 ? chartColors.empty : v >= goal ? colors.action : chartColors.faint,
                }]} />
            </View>
          ))}
        </View>
        {goal > 0 && (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, goalFade]}>
            {width > 0 && (
              <Svg width={width} height={PLOT_HEIGHT}>
                <Line x1={0} x2={width} y1={goalY} y2={goalY} stroke={colors.sub} strokeWidth={1.5} strokeDasharray="4 4" />
              </Svg>
            )}
            <Text style={[styles.goalTag, { top: Math.max(0, goalY - 18) }]}>Goal {goal}</Text>
          </Animated.View>
        )}
      </View>
      <View style={styles.axis}>
        <Text style={styles.footText}>{labels[0]}</Text>
        <Text style={styles.footText}>{labels[labels.length - 1]}</Text>
      </View>
    </View>
  );
}

// ── How well ────────────────────────────────────────────────────

/** The share answered right, day by day. Days with no answers have no point; the
 * line runs between the days that do. */
export function AccuracyChart({ values, labels }: { values: (number | null)[]; labels: string[] }) {
  const [width, setWidth] = useState(0);
  const pad = 6;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = (pct: number) => pad + (1 - pct / 100) * (PLOT_HEIGHT - pad * 2);
  const points = values.map((v, i) => (v === null ? null : { x: pad + i * step, y: y(v) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  // The line draws itself left to right, its length uncovered dash by dash.
  const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  const drawn = useEased(width > 0 && points.length > 0 ? 1 : 0, 0, GROW_MS + 300);
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - drawn.value) }));
  return (
    <View>
      <View style={styles.plot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible accessibilityLabel={`Correct answers by day: ${values.map((v, i) => `${labels[i]} ${v === null ? 'none' : `${v}%`}`).join(', ')}`}>
        {width > 0 && (
          <Svg width={width} height={PLOT_HEIGHT}>
            {[100, 50, 0].map((pct) => (
              <Line key={pct} x1={0} x2={width} y1={y(pct)} y2={y(pct)} stroke={chartColors.empty} strokeWidth={1} />
            ))}
            {points.length > 1 && (
              <AnimatedPolyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none"
                stroke={colors.action} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={[length, length]} animatedProps={lineProps} />
            )}
            {points.map((p, i) => (
              <Dot key={i} x={p.x} y={p.y} last={i === points.length - 1} drawn={drawn}
                at={points.length > 1 ? i / (points.length - 1) : 1} />
            ))}
          </Svg>
        )}
        <Text style={[styles.gridTag, { top: y(100) - 8 }]}>100%</Text>
        <Text style={[styles.gridTag, { top: y(50) - 8 }]}>50%</Text>
      </View>
      <View style={styles.axis}>
        <Text style={styles.footText}>{labels[0]}</Text>
        <Text style={styles.footText}>{labels[labels.length - 1]}</Text>
      </View>
    </View>
  );
}

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A day's point, shown as the line reaches it. */
function Dot({ x, y, last, drawn, at }: { x: number; y: number; last: boolean; drawn: SharedValue<number>; at: number }) {
  const reached = useAnimatedProps(() => ({ opacity: drawn.value >= at - 0.001 ? 1 : 0 }));
  return (
    <AnimatedCircle cx={x} cy={y} r={last ? 5 : 3.5} fill={last ? colors.action : colors.surf}
      stroke={colors.action} strokeWidth={2} animatedProps={reached} />
  );
}

/** What an answers-based chart shows before there are any answers to show. */
export function ChartWaiting({ children }: { children: string }) {
  return <View style={styles.waiting}><Text style={styles.waitingText}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  head: { gap: space.hair },
  label: { ...type.caption, fontFamily: fonts.semibold, color: colors.faint },
  value: { ...type.title, color: colors.sub },
  unit: { ...type.small, fontFamily: fonts.medium, color: colors.faint },
  note: { ...type.small, fontFamily: fonts.medium, color: colors.text },

  stageWrap: { gap: space[3] },
  stageBar: { height: 16, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: chartColors.empty },
  stageReveal: { height: '100%', overflow: 'hidden' },
  stageSegments: { height: '100%', flexDirection: 'row', gap: space.hair },
  stageSegment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[2] },
  legendItem: { width: '33.33%', flexDirection: 'row', alignItems: 'center', gap: space[1] },
  legendDot: { width: 10, height: 10, borderRadius: radius.sm },
  legendName: { ...type.caption, color: colors.faint },
  legendCount: { ...type.caption, fontFamily: fonts.semibold, color: colors.sub },

  columns: { flexDirection: 'row', gap: space[2] },
  column: { flex: 1, alignItems: 'center', gap: space[1] },
  columnCount: { ...type.caption, fontFamily: fonts.semibold, color: colors.sub },
  columnCountNone: { color: colors.faint },
  columnTrack: { height: COLUMN_HEIGHT, width: '100%', justifyContent: 'flex-end' },
  columnBar: { width: '100%', borderRadius: radius.sm },
  columnLabel: { ...type.caption, color: colors.faint },
  columnLabelToday: { fontFamily: fonts.semibold, color: colors.sub },

  grid: { gap: space[1] },
  gridRow: { flexDirection: 'row', gap: space[1] },
  weekday: { ...type.caption, fontFamily: fonts.semibold, width: CELL, textAlign: 'center', color: colors.faint },
  tile: { width: CELL, height: CELL, borderRadius: radius.sm, overflow: 'hidden' },
  tileFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.sm },
  tileToday: { borderWidth: 1.5, borderColor: colors.actionShell },
  footText: { ...type.caption, color: colors.faint },

  plot: { height: PLOT_HEIGHT },
  goalBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
  goalSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  goalBar: { width: '100%', borderRadius: radius.sm },
  goalTag: { ...type.caption, fontFamily: fonts.semibold, position: 'absolute', right: 0, color: colors.sub, backgroundColor: colors.surf, paddingHorizontal: space[1] },
  gridTag: { ...type.caption, position: 'absolute', left: 0, color: colors.faint, backgroundColor: colors.surf, paddingRight: space[1] },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space[2] },

  waiting: { minHeight: 72, borderRadius: radius.md, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[4] },
  waitingText: { ...type.caption, color: colors.faint, textAlign: 'center' },
});
