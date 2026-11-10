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
assert.notEqual(colors.muted, referenceColors.inkMuted);
assert.equal(colors.action, referenceColors.inkPrimary);
assert.equal(colors.bg, referenceColors.canvas);
assert.equal(colors.accent, colors.action);
assert.equal(colors.ai, colors.text);
assert.equal(colors.studyGradientStart, colors.studyGradientEnd);
assert.equal(referenceTypography.navActive.size, 10);
assert.equal(type.navActive.fontSize, 12);
assert.equal(referenceTypography.section.lineHeight, 'Auto');
assert.equal(referenceTypography.page.trackingUnit, 'RAW');
assert.equal(type.page.letterSpacing, undefined);
assert.equal(componentTokens.primaryAction.minHeight, 52);
assert.equal(componentTokens.course.minHeight, 72);

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
