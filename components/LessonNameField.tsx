/**
 * Where cards go: one box that names a new lesson or finds one they have.
 *
 * This began in the chat (components/chat/LessonTarget), where it replaced a name
 * box with a "use an existing one" link beside it — two controls for one
 * question. The name is a search box instead. Type, and the lessons you already
 * have that match appear under it; tap one and the cards go there. Type something
 * that matches nothing and that is the name of a new lesson. The same keystrokes
 * do both, because "where do these go" is one question.
 *
 * It is here, and not in the chat's folder, because the question is asked in
 * three places — the chat, the page that saves newly made cards, and the import
 * page — and it should be asked the same way in each. The first version outside
 * the chat listed the matches in the page, under the box: two things where there
 * is one, and a page that changed height as it was typed in.
 *
 * The matches hang over what is below rather than sitting in it. In the flow they
 * pushed the next field and the button down the moment anyone touched the box,
 * so the page moved while it was being read. A menu opens over what is already
 * there and closes again, leaving it where it was.
 */

import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { listLessonsForDrafts, type LessonChoice } from '@/lib/chatDrafts';
import { matchLessons } from '@/lib/lessonMatch';
import { supabase } from '@/lib/supabase';
import { colors, fonts, hairline, radius, space, type } from '@/theme';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

/** How many of their lessons to offer at once. A search box that answers with a
 *  library is a library, not an answer; the rest are found by typing more. */
const SUGGEST = 6;
/** How far the menu may hang. Four rows and a little, so that a fifth is cut off
 *  rather than hidden: a list that scrolls has to look like one. */
const MENU_DROP = 212;

export function LessonNameField({ label = 'Lesson', value, onChangeText, chosen, onChoose, search = true, disabled, autoFocus, style }: {
  label?: ReactNode;
  /** What is in the box: a new lesson's name, or the name of the one picked. */
  value: string;
  onChangeText: (text: string) => void;
  /** Set when the box's text is a lesson they already have. Null means what is
   *  typed is a new lesson. */
  chosen: LessonChoice | null;
  onChoose: (lesson: LessonChoice | null) => void;
  /** False where there is nothing to add to a lesson — naming an empty one —
   *  and the box is then only a name. */
  search?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [lessons, setLessons] = useState<LessonChoice[] | null>(null);
  /** Whether the menu is open. It stays shut until the box is touched: on arrival
   *  what is in the box is the answer, and a list under it would be arguing with it. */
  const [looking, setLooking] = useState(false);
  const box = useRef<TextInput>(null);

  /* Read as soon as this is on screen, not when the box is first tapped: the
   * suggestions have to be there the moment someone starts typing. */
  useEffect(() => {
    if (!search) return;
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return live && setLessons([]);
      const found = await listLessonsForDrafts(supabase as never, data.user.id);
      if (live) setLessons(found);
    })();
    return () => { live = false; };
  }, [search]);

  const typed = value.trim();
  const matches = useMemo(() => {
    // A picked lesson's own name is not something being searched for: the one
    // row it would find is the row already in the box.
    if (!lessons || (chosen && typed === chosen.name)) return [];
    return matchLessons(lessons, typed, SUGGEST);
  }, [chosen, lessons, typed]);

  const open = looking && matches.length > 0;
  return (
    <View style={[styles.combo, style]}>
      {/* The touch, not the focus, is what opens the menu. Coming back to a box
          that already holds the cursor only moves the cursor — no focus event —
          and a box you have to blur before you can reopen is a box that ignores
          you. The rows are outside this wrapper, so picking one does not reopen
          what it just closed. */}
      <View onTouchStart={() => setLooking(true)}>
        <Field
          ref={box}
          label={label}
          accessibilityLabel="Lesson. Type a new name, or find a lesson you have."
          value={value}
          autoFocus={autoFocus}
          onChangeText={(text) => {
            onChangeText(text);
            // Typing over a chosen lesson is leaving it: what is in the box is the
            // answer, so it cannot still mean the one that used to be there.
            if (chosen) onChoose(null);
            setLooking(true);
          }}
          // A page that opens with the cursor already in this box gets focus
          // events nobody caused — one on arrival, another as the screen settles —
          // and a menu opened by those arrives hanging over the page's other
          // fields. There, touching the box or typing in it is what opens it.
          onFocus={() => { if (!autoFocus) setLooking(true); }}
          // Touching anything else is closing the menu, the way a menu closes.
          onBlur={() => setLooking(false)}
          placeholder={search ? 'Find one, or name a new one' : 'Name this lesson'}
          maxLength={160}
          // Hidden while the menu is over it, since that is what it is saying.
          hint={open || !search ? undefined
            : chosen ? 'Adding to a lesson you already have.'
            : lessons?.length ? 'A new lesson, unless you pick one of yours.'
            : undefined}
          // Emptying the box is how you go looking again, so it is one tap rather
          // than a held backspace. Only there while there is something to clear.
          trailing={value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear"
              hitSlop={10}
              onPress={() => {
                onChangeText('');
                if (chosen) onChoose(null);
                setLooking(true);
                box.current?.focus();
              }}
              style={({ pressed }) => pressed && styles.faded}
            >
              <Icon name="close" size={18} color={colors.faint} />
            </Pressable>
          ) : undefined}
        />
      </View>

      {/* Theirs, matching what is typed, hanging under the box. Picking happens
          on the press going down rather than coming up: the same touch takes the
          cursor out of the box, and a row that waited for the release would be
          gone by the time it came. */}
      {open && (
        <View style={styles.menu}>
          <ScrollView style={styles.menuRoll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {matches.map((lesson, at) => (
              <Pressable
                key={lesson.id}
                accessibilityRole="button"
                accessibilityLabel={`Add to ${lesson.name}`}
                disabled={disabled}
                onPressIn={() => {
                  onChoose(lesson);
                  onChangeText(lesson.name);
                  setLooking(false);
                  // The question is answered, so the cursor has nothing left to
                  // do in the box and the keyboard nothing to do over the button
                  // that acts on it.
                  box.current?.blur();
                }}
                style={({ pressed }) => [styles.hit, at > 0 && styles.under, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.hitName}>{lesson.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Over its neighbours rather than between them, so the menu is drawn on top of
  // the field below instead of behind it.
  combo: { zIndex: 2 },
  menu: {
    position: 'absolute', left: 0, right: 0, top: '100%', marginTop: space[1],
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.line,
    backgroundColor: colors.surf,
    // Rows are square-cornered; the corners come from the menu clipping them.
    overflow: 'hidden',
  },
  menuRoll: { maxHeight: MENU_DROP },
  hit: { paddingVertical: space[3], paddingHorizontal: space[3] },
  // A line between rows, not around each: the menu is one object.
  under: { borderTopWidth: hairline, borderTopColor: colors.line },
  pressed: { backgroundColor: colors.panel },
  faded: { opacity: 0.5 },
  hitName: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
});
