const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTheme } = require('./theme-module.cjs');
const { colors, referenceColors } = loadTheme('colors');
const { type, referenceTypography, fonts } = loadTheme('typography');
const { componentTokens } = loadTheme('components');
const { artwork } = loadTheme('artwork');
const { progressPercent } = loadTheme('progress');

// Protect source vs adaptation: a visual or accessibility adjustment cannot erase its evidence.
assert.equal(referenceColors.inkMuted, '#858580');
assert.notEqual(colors.sub, referenceColors.inkMuted);
assert.equal(colors.action, '#6c3cbc');
assert.equal(colors.bg, '#fcfced');
// One purple, two decisions: the ink it is written in and the shell a filled
// action stands on. They may agree; they are not the same token.
assert.equal(colors.actionShell, colors.sub);
// No two names in the palette may be synonyms: a value may appear more than once
// only where the roles differ, and each of those roles is named here.
const byValue = new Map();
for (const [name, value] of Object.entries(colors)) {
  if (!byValue.has(value)) byValue.set(value, []);
  byValue.get(value).push(name);
}
const allowedSharing = [['sub','actionShell'], ['surf','onAction'], ['transparent','shadow']];
for (const [value, names] of byValue) {
  if (names.length === 1) continue;
  assert(allowedSharing.some((pair) => pair.length === names.length && pair.every((n) => names.includes(n))),
    `colors ${names.join(', ')} are the same value (${value}); one of them is a synonym`);
}
// The drawings' colours are not the system's. If a structural token ever takes one
// of them, the palette has started to mean two things at once.
//
// Two tokens share a value with the source record on purpose: the scrim, which was
// measured rather than drawn, and the wordmark, which is the brand mark the screens
// place — not a picture the system borrowed a paint from.
const structuralByOrigin = ['scrim', 'wordmark'];
for (const [name, value] of Object.entries(colors)) {
  if (structuralByOrigin.includes(name)) continue;
  const borrowed = Object.entries(referenceColors).find(([, v]) => v === value);
  assert(!borrowed, `colors.${name} is painted in referenceColors.${borrowed && borrowed[0]}; an illustration colour is not a UI token`);
}
// The source measured a 10-point navigation label; the runtime sets 12, because
// a 10-point tab label is not readable. The record and the adaptation both stay.
assert.equal(referenceTypography.navActive.size, 10);
assert.equal(referenceTypography.section.lineHeight, 'Auto');
assert.equal(referenceTypography.page.trackingUnit, 'RAW');
assert.equal(type.page.letterSpacing, undefined);

// The scale is seven steps, and each one is a size nothing else in it shares.
// Adding an eighth is a decision, not a convenience, and it fails here first.
const steps = Object.values(type).map((role) => role.fontSize);
assert.equal(steps.length, 7, 'the type scale is seven steps');
assert.equal(new Set(steps).size, 7, 'two type roles are the same size');
// Every line height sits on the four-point grid the spacing scale uses.
for (const [name, role] of Object.entries(type)) {
  assert.equal(role.lineHeight % 4, 0, `type.${name} line height is off the four-point grid`);
  assert(role.lineHeight > role.fontSize, `type.${name} line height is tighter than its size`);
}
// The button is the only component with tokens of its own now, and the sizes it
// offers are what a screen may ask for. A fifth one is a decision, not a tweak.
assert.deepEqual(Object.keys(componentTokens), ['button', 'chip', 'field', 'search', 'iconButton', 'card']);
// A card is held, not pressed, so it stands at the middle depth: deeper than a
// chip, shallower than the one button a screen wants pressed. Depth is the only
// thing that separates them, so the order has to hold.
assert(componentTokens.card.lip > componentTokens.button.lip.control,
  'a card should stand higher than a small control');
assert(componentTokens.card.lip < componentTokens.button.lip.lead,
  'a card should not stand as high as the button a screen leads with');
// Both layers of a card, and both layers of a chosen one, have to differ or the
// band along the bottom is invisible.
assert.notEqual(componentTokens.card.shell, componentTokens.card.face, 'a card needs a shell darker than its face');
assert.notEqual(componentTokens.card.selected.shell, componentTokens.card.selected.face,
  'a chosen card needs a shell darker than its face');
for (const size of ['xl', 'lg', 'md', 'sm']) {
  assert(componentTokens.button[size].height >= 40, `button ${size} is below the comfortable minimum`);
  assert.equal(componentTokens.button[size].height % 4, 0, `button ${size} is off the four-point grid`);
}
// Somewhere to type is never shorter than something to press.
assert(componentTokens.field.minHeight >= componentTokens.button.md.height,
  'a field is shorter than a button');
assert.equal(componentTokens.search.minHeight, componentTokens.field.minHeight,
  'the search field and the form field are different heights');
// A chip is a choice, not a command: it must not borrow the button's pill, or the
// two stop being telling apart at a glance.
assert.notEqual(componentTokens.chip.radius, componentTokens.button.radius);
// An icon button has no label to widen it, so the smallest one leans on hitSlop to
// reach the minimum target; it may be small, but not smaller than its own glyph.
// Its lip is inside the diameter, so it must leave a face worth pressing.
for (const [name, side] of Object.entries(componentTokens.iconButton.size)) {
  assert.equal(side % 4, 0, `iconButton ${name} is off the four-point grid`);
  assert(side >= 36, `iconButton ${name} is too small to aim at`);
  const lip = componentTokens.iconButton.lip[name];
  assert(lip > 0 && lip < side / 8, `iconButton ${name} lip of ${lip} is out of proportion to ${side}`);
}

// Regression: the supplied source's progress geometry disagrees with its data.
for (const [done, total, expected] of [[6,20,30], [0,20,0], [20,20,100], [30,20,100], [-3,20,0], [3,0,0], [3,-1,0], [NaN,20,0], [3,Infinity,0]]) assert.equal(progressPercent(done,total), expected);
assert.equal(artwork.decorations.length, 16);
assert.equal(artwork.inkling.length, 12);
const allAssets = [...artwork.decorations,...artwork.inkling];
assert.equal(new Set(allAssets.map(a=>a.nodeId)).size, 28);
assert(allAssets.every(a=>['figma-source-only','local-export'].includes(a.availability) && a.url.includes(a.nodeId.replace(':','-'))));
for (const item of allAssets.filter(a=>a.availability==='local-export')) {
  assert(item.localPath && fs.statSync(path.resolve(__dirname,'..',item.localPath)).size > 0);
}
// Missing fonts must fail here instead of silently producing a system-font preview.
for (const [key,name] of Object.entries(fonts)) {
  if (['grotesk','serif','mono'].includes(key)) continue;
  if (key==='code') assert(fs.existsSync(path.resolve(__dirname, '../assets/fonts/JetBrainsMono-Regular.ttf')));
  else {
    const [family,variant]=name.split('_');
    assert(fs.existsSync(require.resolve(`@expo-google-fonts/${family.toLowerCase()}/${variant}/${name}.ttf`)));
  }
}
console.log('Design-system source/adaptation, font assets, artwork registry and progress checks passed.');
