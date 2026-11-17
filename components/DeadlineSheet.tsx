import { DesignAsset } from '@/components/DesignAsset';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { calendarCells, sameCalendarDay, shiftCalendarMonth } from '@/lib/calendar';
import { deadlinePace } from '@/lib/studyPlan';
import { interaction, space, fonts, colors, layout, radius, type } from '@/theme';
import { oneLine } from '@/theme/typography';
import { Sheet } from '@/components/ui/Sheet';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export function DeadlineSheet({ visible, value, cards = 0, onClose, onConfirm }: {
  visible: boolean;
  value: Date | null;
  /** How many cards the lesson holds, so the line under the title can say what the
   *  date asks for a day. A lesson with none yet is only given the days. */
  cards?: number;
  onClose: () => void;
  onConfirm: (date: Date | null) => void;
}) {
  const [draft, setDraft] = useState<Date | null>(value);
  const [month, setMonth] = useState(value || new Date());
  const valueTime = value?.getTime();
  useEffect(() => {
    if (visible) { setDraft(valueTime === undefined ? null : new Date(valueTime)); setMonth(valueTime === undefined ? new Date() : new Date(valueTime)); }
  }, [visible, valueTime]);
  const cells = calendarCells(month.getFullYear(), month.getMonth());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return <Sheet visible={visible} onClose={onClose} title="Deadline (optional)" closeLabel="Close deadline picker">
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} bounces={false}>
      {/* Once a date is picked the line stops repeating the instruction and
          says what that date asks for — the same ration the plan will give. */}
      <Text accessibilityLiveRegion="polite" style={styles.support}>{supportLine(draft, cards, today)}</Text>
      <View style={styles.draft}>
        <Text style={styles.draftValue}>{draft ? draft.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear draft deadline" onPress={() => setDraft(null)} disabled={!draft} style={styles.clear}>
          <Text style={[styles.link, !draft && styles.muted]}>Clear</Text>
        </Pressable>
      </View>
      <View style={styles.calendar}>
        <View style={styles.heading}>
          <IconButton variant="quiet" size="sm" label="Previous month" onPress={() => setMonth(shiftCalendarMonth(month, -1))}><DesignAsset name="editLeft" /></IconButton>
          <Text accessibilityLiveRegion="polite" style={styles.month}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
          <IconButton variant="quiet" size="sm" label="Next month" onPress={() => setMonth(shiftCalendarMonth(month, 1))}><DesignAsset name="editRight" /></IconButton>
        </View>
        <View style={styles.week}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <View key={index} style={styles.weekday}><Text style={styles.weekdayLabel}>{day}</Text></View>)}</View>
        {weeks.map((week, index) => <View key={index} style={styles.week}>
          {week.map((date, dayIndex) => {
            if (!date) return <View key={dayIndex} style={styles.day} />;
            const selected = sameCalendarDay(date, draft);
            const isToday = sameCalendarDay(date, today);
            const past = date < today;
            return <Pressable key={dayIndex} accessibilityRole="button" disabled={past}
              accessibilityLabel={`${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${isToday ? ', today' : ''}`}
              accessibilityState={{ selected, disabled: past }} onPress={() => setDraft(date)}
              style={styles.day}>
              <View style={[styles.mark, isToday && !selected && styles.today, selected && styles.selectedDay]}>
                <Text style={[styles.dayLabel, past && styles.muted, isToday && !selected && styles.todayLabel, selected && styles.selectedLabel]}>{date.getDate()}</Text>
              </View>
            </Pressable>;
          })}
        </View>)}
      </View>
      <Text style={styles.note}>The deadline changes only when you confirm.</Text>
      <View style={styles.actions}>
        <Button size="lg" variant="secondary" label="Cancel" accessibilityLabel="Cancel deadline selection" onPress={onClose} style={styles.action} />
        <Button size="lg" label="Confirm" accessibilityLabel="Confirm deadline selection" onPress={() => onConfirm(draft)} style={styles.action} />
      </View>
    </ScrollView>
  </Sheet>;
}
/** What the date chosen asks for, in the words a person would use. */
function supportLine(draft: Date | null, cards: number, today: Date): string {
  if (!draft) return 'Choose a date, or leave the deadline unset.';
  const { days, perDay } = deadlinePace(draft, cards, today);
  const left = days === 0 ? 'Due today' : days === 1 ? '1 day left' : `${days} days left`;
  if (perDay === null) return `${left}. Add cards and this will say how many a day.`;
  return `${left} · about ${perDay} new ${perDay === 1 ? 'card' : 'cards'} a day.`;
}

/** The disc a date is marked with, inside its touch target. */
const DAY = 40;
const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenInline, gap: space[4] },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  support: { ...type.small, color: colors.sub },
  draft: { backgroundColor: colors.panel, borderRadius: radius.md, padding: space[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  draftValue: { ...type.small, fontFamily: fonts.semibold, color: colors.text, flexShrink: 1 },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  link: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  muted: { color: colors.sub },
  calendar: { gap: space[1] },
  month: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center' },
  weekdayLabel: { ...type.caption, color: colors.sub },
  // The cell is as wide as a seventh of the row; the mark inside it is square, so
  // a pill radius comes out a circle rather than an egg.
  day: { flex: 1, minHeight: interaction.minTarget, alignItems: 'center', justifyContent: 'center' },
  mark: { width: DAY, height: DAY, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { ...oneLine(type.body), color: colors.text },
  // Today is where the calendar starts reading from, so it is marked even when it
  // is not the date chosen: an outline rather than a fill, which the choice owns.
  today: { borderWidth: 1.5, borderColor: colors.action },
  todayLabel: { fontFamily: fonts.semibold, color: colors.action },
  selectedDay: { backgroundColor: colors.action },
  selectedLabel: { color: colors.onAction },
  note: { ...type.caption, color: colors.sub },
  actions: { flexDirection: 'row', gap: space[3] },
  // Where it sits, and nothing else: horizontal padding here lands on the shell,
  // which then shows down both sides of the face instead of only under it.
  action: { flex: 1 },
});
