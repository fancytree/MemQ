/**
 * Cards pasted in from the person's own AI, under the box they were pasted into.
 *
 * Each is a card of its own, drawn the way the cards beside it are — the ones
 * our model writes and the ones typed by hand: the small heading that says which
 * card it is and where it came from, the term, what it means. The first version
 * ran them together as rows in one panel, which read as a list of something
 * else on a page whose other cards each stand alone.
 *
 * Short on purpose, though. They arrive finished — written, and with their
 * questions — so there is nothing here to edit or to write again. What it means
 * sits on a panel inside the card, and the one control is the bin that leaves it
 * out. Nothing else is said: not that it was imported, which the heading over
 * the list says once, and not how many questions it brought. A language card is not
 * laid out in full either; its reading, forms and example are a screen each,
 * and twelve of those bury the box they came through. They are on the card once
 * it is saved.
 */

import { SectionLabel } from '@/components/SectionLabel';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import type { ImportedCard } from '@/lib/cardImport';
import { colors, fonts, radius, space, type } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export function ImportedCards({ cards, onRemove }: { cards: ImportedCard[]; onRemove: (id: string) => void }) {
  if (!cards.length) return null;
  return (
    <View style={styles.list}>
      {cards.map((card, at) => (
        <Card key={card.id} pad="none" gap={0}>
          <View style={styles.head}>
            <View style={styles.heading}>
              {/* Only its number. The heading over the list already says these were
                  imported, and how many questions each brought is not something
                  to decide anything by. */}
              <SectionLabel style={styles.label}>{`Card ${String(at + 1).padStart(2, '0')}`}</SectionLabel>
              <Text style={styles.term}>{card.term}</Text>
            </View>
            {/* A bin, not a cross: a cross on a card reads as "close this",
                and what it does is throw the card away. */}
            <IconButton variant="quiet" size="sm" label={`Remove ${card.term}`} onPress={() => onRemove(card.id)}>
              <Icon name="delete" size={18} color={colors.faint} />
            </IconButton>
          </View>
          <View style={styles.body}>
            {/* What it means, set on the panel a card keeps for what is inside
                it, so the card has a face and a content rather than three
                lines of text on white. */}
            <View style={styles.meaning}>
              <Text numberOfLines={3} style={styles.definition}>{card.definition}</Text>
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  // The same measures as a generated card's head and body (app/create).
  head: { paddingHorizontal: space[4], paddingTop: space[4], flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  heading: { flex: 1 },
  label: { marginBottom: space[1] },
  term: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  body: { paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4] },
  meaning: { borderRadius: radius.md, backgroundColor: colors.panel, paddingHorizontal: space[3], paddingVertical: space[3] },
  definition: { ...type.small, color: colors.sub },
});
