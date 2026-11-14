import { DesignAsset } from '@/components/DesignAsset';
import { ActionButton } from '@/components/ui/ActionButton';
import { calendarCells, sameCalendarDay, shiftCalendarMonth } from '@/lib/calendar';
import { colors, componentTokens, layout, radius, type } from '@/theme';
import { sheet as sheetShape } from '@/theme/sheet';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function DeadlineSheet({ visible, value, onClose, onConfirm }: {
  visible: boolean; value: Date | null; onClose: () => void; onConfirm: (date: Date | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Date | null>(value);
  const [month, setMonth] = useState(value || new Date());
  const valueTime = value?.getTime();
  useEffect(() => {
    if (visible) { setDraft(valueTime === undefined ? null : new Date(valueTime)); setMonth(valueTime === undefined ? new Date() : new Date(valueTime)); }
  }, [visible, valueTime]);
  const cells = calendarCells(month.getFullYear(), month.getMonth());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Dismiss deadline picker" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom) }]}>
        <View accessible={false} style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} bounces={false}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>Deadline (optional)</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close deadline picker" onPress={onClose} style={styles.iconButton}><DesignAsset name="editClose" /></Pressable>
          </View>
          <Text style={styles.support}>Choose a date, or leave the deadline unset.</Text>
          <View style={styles.draft}>
            <Text style={styles.draftValue}>{draft ? draft.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear draft deadline" onPress={() => setDraft(null)} disabled={!draft} style={styles.clear}>
              <Text style={[styles.link, !draft && styles.muted]}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.calendar}>
            <View style={styles.heading}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(shiftCalendarMonth(month, -1))} style={styles.previous}><DesignAsset name="editLeft" /></Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.month}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(shiftCalendarMonth(month, 1))} style={styles.next}><DesignAsset name="editRight" /></Pressable>
            </View>
            <View style={styles.week}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <View key={index} style={styles.weekday}><Text style={styles.weekdayLabel}>{day}</Text></View>)}</View>
            {weeks.map((week, index) => <View key={index} style={styles.week}>
              {week.map((date, dayIndex) => {
                if (!date) return <View key={dayIndex} style={styles.day} />;
                const selected = sameCalendarDay(date, draft);
                const past = date < today;
                return <Pressable key={dayIndex} accessibilityRole="button" disabled={past}
                  accessibilityLabel={date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  accessibilityState={{ selected, disabled: past }} onPress={() => setDraft(date)}
                  style={[styles.day, selected && styles.selectedDay]}>
                  <Text style={[styles.dayLabel, past && styles.muted, selected && styles.selectedLabel]}>{date.getDate()}</Text>
                </Pressable>;
              })}
            </View>)}
          </View>
          <Text style={styles.note}>The deadline changes only when you confirm.</Text>
          <View style={styles.actions}>
            <ActionButton secondary label="Cancel" accessibilityLabel="Cancel deadline selection" onPress={onClose} style={styles.action} />
            <ActionButton label="Confirm" accessibilityLabel="Confirm deadline selection" onPress={() => onConfirm(draft)} style={styles.action} />
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const t = componentTokens.lessonEditor;
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.modalScrim },
  sheet: { ...sheetShape.surface, maxHeight: '92%', paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.sheetHandle, alignSelf: 'center', marginBottom: 14 },
  content: { paddingHorizontal: layout.screenInline, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { ...type.sheetHeading, color: colors.text, flexShrink: 1 },
  iconButton: { width: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  support: { ...type.bodySmall, color: colors.supporting },
  draft: { backgroundColor: colors.paperIvory, borderRadius: t.fieldRadius, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  draftValue: { ...type.controlLink, color: colors.text, flexShrink: 1 },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  link: { ...type.controlLink, color: colors.text },
  muted: { color: colors.muted },
  calendar: { gap: 4 },
  month: { ...type.controlLink, color: colors.text },
  previous: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' },
  next: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center' },
  weekdayLabel: { ...type.meta, color: colors.muted },
  day: { flex: 1, minHeight: t.calendarDayHeight, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  dayLabel: { ...type.input, color: colors.text },
  selectedDay: { backgroundColor: colors.action },
  selectedLabel: { color: colors.onAction },
  note: { ...type.meta, color: colors.supporting },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, paddingHorizontal: 12 },
});
