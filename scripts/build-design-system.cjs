/** Generated review specimen; no artwork is fabricated or relabelled as an approved asset. */
const fs = require('node:fs');
const path = require('node:path');
const { tokens, colors, referenceColors, kebab } = require('./sync-color-tokens.cjs');
const { loadTheme } = require('./theme-module.cjs');
const { progressPercent } = loadTheme('progress');
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fontFaces = Object.entries(tokens.runtime.fonts).filter(([key]) => !['grotesk', 'serif', 'mono'].includes(key)).map(([key, name]) => {
  if (key === 'code') return `@font-face { font-family: '${name}'; src: url('../../assets/fonts/JetBrainsMono-Regular.ttf') format('truetype'); font-display: swap; }`;
  const [family, variant] = name.split('_');
  return `@font-face { font-family: '${name}'; src: url('../../node_modules/@expo-google-fonts/${family.toLowerCase()}/${variant}/${name}.ttf') format('truetype'); font-display: swap; }`;
}).join('\n');
const palette = [['Canvas', 'bg'], ['Primary ink', 'text'], ['Neutral surface', 'surfaceSubtle'], ['Subtle line', 'border'], ['Readable metadata · adapted', 'muted'], ['Control boundary · extension', 'controlBorder']];
const papers = [['Today note','todayNote'],['Peach backing','paperPeach'],['Lilac backing','paperLilac'],['Blue backing','paperBlue'],['Inkling body · artwork only','inklingBody'],['Wordmark rays · detail only','wordmarkRays']];
const swatches = (items, ref = false) => items.map(([name, key]) => `<div class="swatch"><span class="paint" style="background:var(--memq-${ref ? 'reference-' : ''}${kebab(key)})"></span><div><strong>${escape(name)}</strong><code>${escape((ref ? referenceColors : colors)[key])}</code></div></div>`).join('');
const typeSamples = [['page','A little learning, every day.'],['section','Your courses'],['courseTitle','Everyday Italian'],['button','Start learning'],['meta','8 due · 32 cards'],['greeting','Hi, Alex.'],['annotation',"a little goes a long way"]].map(([role, text]) => `<div class="type-row"><span class="sample" style="font-family:var(--memq-type-${kebab(role)}-family);font-size:var(--memq-type-${kebab(role)}-size);line-height:var(--memq-type-${kebab(role)}-height)">${escape(text)}</span><code>${escape(role)} · ${tokens.runtime.typography[role].fontSize}px</code></div>`).join('');
const artworkLinks = (list) => list.map((a) => `<a class="asset" href="${escape(a.url)}" target="_blank" rel="noreferrer"><strong>${escape(a.name)} <span aria-hidden="true">↗</span></strong><span>${escape(a.use)}</span><code>${escape(a.nodeId)} · ${a.availability === 'local-export' ? 'Local SVG export' : 'Figma source'}</code></a>`).join('');
const arrow = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const navIcons = ['<path d="M4 11l8-7 8 7v9H4z"/>','<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>','<rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M9 4v16"/>'];
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MemQ · Design system v2</title>
<link rel="stylesheet" href="../../app/colors_and_type.css"><style>
${fontFaces}
body { margin:0; font-family:'Manrope_400Regular',sans-serif; color:var(--memq-text); background:var(--memq-bg); }
a { color:inherit; text-underline-offset:4px; }
.page { max-width:1120px; margin:auto; padding:40px 36px 80px; }
header { display:flex; align-items:center; justify-content:space-between; gap:24px; padding-bottom:32px; border-bottom:1px solid var(--memq-border); }
.wordmark { font-family:'Manrope_800ExtraBold'; font-size:25px; line-height:32px; letter-spacing:-1.1px; color:var(--memq-wordmark); }
.version, .eyebrow, code { font-family:'Inter_400Regular',sans-serif; font-size:12px; line-height:18px; color:var(--memq-muted); }
.intro { display:grid; grid-template-columns:1.2fr 1fr; gap:64px; padding:48px 0; }
h1 { font-family:'Manrope_700Bold'; font-size:30px; line-height:34px; margin:12px 0 20px; font-weight:normal; }
h2 { font-family:'Manrope_700Bold'; font-size:19px; line-height:26px; margin:0 0 12px; font-weight:normal; }
h3 { font-family:'Manrope_600SemiBold'; font-size:15px; margin:28px 0 12px; font-weight:normal; }
p { margin:0 0 14px; } .muted { color:var(--memq-muted); } .small { font-size:12px; line-height:18px; }
.tags { display:flex; flex-wrap:wrap; gap:8px; margin-top:20px; }
.tag { background:var(--memq-surface-subtle); border-radius:100px; padding:5px 11px; font-family:'Inter_400Regular'; font-size:12px; }
.rule { border-top:1px solid var(--memq-border); padding:32px 0; }
.lede { max-width:650px; color:var(--memq-muted); font-size:14px; line-height:23px; }
.grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:24px; }
.swatch { display:flex; align-items:center; gap:12px; min-width:0; }
.paint { width:52px; height:52px; flex-shrink:0; border:1px solid var(--memq-border); }
strong { font-family:'Manrope_600SemiBold'; font-weight:normal; } .swatch strong { display:block; font-size:12px; line-height:18px; }
code { display:block; margin-top:3px; }
.two { display:grid; grid-template-columns:1fr 1fr; gap:64px; }
.type-row { padding:18px 0; border-bottom:1px solid var(--memq-border); }
.sample { display:block; }
.demo { max-width:354px; margin-top:20px; }
.btn-primary { width:100%; } .btn-primary + .btn-primary { margin-top:12px; }
.goal-summary { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px; }
.goal-label { font-family:'Manrope_400Regular'; font-size:20px; line-height:28px; }
.goal-count { font-family:'Inter_400Regular'; font-size:15px; color:var(--memq-muted); }
.goal-count strong { font-family:'Inter_600SemiBold'; color:var(--memq-text); }
.track { height:5px; background:var(--memq-progress-track); border-radius:100px; overflow:hidden; }
.fill { width:${progressPercent(6,20)}%; height:100%; background:var(--memq-action); border-radius:100px; }
.course { min-height:72px; display:flex; align-items:center; gap:14px; text-decoration:none; }
.course > div { flex:1; padding:12px 0; } .course strong { display:block; font-size:15px; line-height:19px; }
.course span { display:block; font-size:12px; line-height:17px; color:var(--memq-muted); margin-top:6px; }
.chevron { color:var(--memq-muted); width:32px; text-align:right; }
.course:hover { background:var(--memq-surface-subtle); }
.nav { display:flex; border-top:1px solid var(--memq-border); padding:10px 12px 8px; }
.nav button { flex:1; min-height:48px; display:flex; flex-direction:column; align-items:center; gap:4px; background:var(--memq-bg); border:0; color:var(--memq-muted); font-family:'Manrope_400Regular'; font-size:12px; padding:0; cursor:pointer; }
.capsule { width:52px; min-height:28px; display:flex; align-items:center; justify-content:center; border-radius:100px; }
.nav button[aria-selected=true] { color:var(--memq-text); font-family:'Manrope_600SemiBold'; }
.nav button[aria-selected=true] .capsule { background:var(--memq-surface-subtle); }
.nav svg { width:21px; height:21px; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:miter; fill:none; }
.assets { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 24px; }
.asset { padding:16px 0; border-bottom:1px solid var(--memq-border); text-decoration:none; }
.asset strong { font-size:13px; } .asset > span { display:block; color:var(--memq-muted); font-size:12px; line-height:18px; margin-top:5px; }
.asset:hover strong { text-decoration:underline; } .notice { border-left:2px solid var(--memq-control-border); padding-left:16px; }
ul { padding-left:20px; } li { margin-bottom:8px; }
footer { border-top:1px solid var(--memq-border); padding-top:24px; font-size:12px; line-height:20px; color:var(--memq-muted); }
@media(max-width:720px) { .page { padding:24px; } .intro,.two { grid-template-columns:1fr; gap:28px; } .grid,.assets { grid-template-columns:repeat(2,minmax(0,1fr)); } header { align-items:flex-start; } }
@media(max-width:400px) { .grid,.assets { grid-template-columns:1fr; } }
</style></head><body><main class="page">
<header><div class="wordmark">MemQ</div><div class="version">Design system · v2<br>Source inspection: 21 Oct 2026</div></header>
<section class="intro"><div><span class="eyebrow">White / ink foundation</span><h1>Color lives<br>in the details.</h1><p class="lede">A quiet, handmade learning interface. White canvas, near-black type, open course rows and a clear neutral action. Paper, handwriting and Inkling provide small human moments.</p><div class="tags"><span class="tag">Measured reference</span><span class="tag">Runtime adaptation</span><span class="tag">Explicit extension</span></div></div>
<div><h2>One source, visible decisions</h2><p class="small muted">Today governs structural UI. The approved decoration and Inkling collections govern their own artwork. These are implementation aliases, not existing Figma variables or newly published components.</p><p class="small"><a href="../../docs/design-system/README.md">Implementation guide ↗</a><br><a href="../../docs/design-system/source-design-language.md">Supplied inspection ↗</a><br><a href="https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1146">Today reference ↗</a></p></div></section>
<section class="rule"><h2>01 · Structural palette</h2><p class="lede">Navigation, actions, selection and progress stay neutral. Source muted gray is preserved separately; small runtime text uses an accessible adaptation.</p><div class="grid">${swatches(palette)}</div><h3>Measured paper and artwork colors</h3><div class="grid">${swatches(papers,true)}</div><p class="small muted" style="margin-top:20px">These swatches demonstrate source colors, not reconstructed approved artwork. Tape RGB and layer opacity remain separate.</p></section>
<section class="rule two"><div><h2>02 · Typography</h2><p class="lede">Manrope for UI, Inter for compact utility/numbers, Caveat for short supportive asides.</p>${typeSamples}</div><div><h2>03 · Reusable patterns</h2><p class="lede">Default geometry is source-backed. Interaction states, text scaling and accessible adjustments are explicitly runtime extensions.</p>
<div class="demo"><h3>Primary action · 52px minimum</h3><button class="btn-primary" type="button">Start learning ${arrow}</button><button class="btn-primary" type="button" disabled>Start learning ${arrow}</button><p class="small muted" style="margin-top:10px">Default / disabled extension. Keyboard focus is visible; labels may wrap.</p>
<h3>Daily goal · data-consistent</h3><div role="progressbar" aria-label="Daily goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30"><div class="goal-summary"><span class="goal-label">Daily goal</span><span class="goal-count"><strong>6 </strong>/ 20</span></div><div class="track"><div class="fill"></div></div></div><p class="small muted" style="margin-top:10px">6/20 = 30%. The source's 24.2% drawn fill is not a production rule.</p>
<h3>Open course rows</h3>${[['Everyday Italian','8 due · 32 cards'],['Cognitive Psychology','7 due · 48 cards'],['Economics Essentials','4 due · 24 cards']].map(([a,b])=>`<a href="#artwork" class="course"><div><strong>${a}</strong><span>${b}</span></div><span class="chevron" aria-hidden="true">›</span></a>`).join('')}<p class="small muted">Text/spacing specimen. Approved 52px illustration exports are not embedded.</p>
<h3>Approved navigation taxonomy</h3><div class="nav" role="tablist" aria-label="Navigation appearance specimen">${['Today','Create','Library'].map((label,i)=>`<button type="button" aria-label="${label}" aria-selected="${i===0}" role="tab" tabindex="${i===0?0:-1}"><span class="capsule"><svg viewBox="0 0 24 24" aria-hidden="true">${navIcons[i]}</svg></span>${label}</button>`).join('')}</div><p class="small muted">Neutral capsule, 12px adapted labels. Production uses device safe-area insets; no fixed 87px clipping rule.</p></div></div></section>
<section class="rule" id="artwork"><h2>04 · Approved artwork sources</h2><p class="lede">16 decorations and 12 Inkling expressions. Source links preserve authorship and exact node identity. Four Inkling poses are exported locally and used in the existing application slots; remaining assets retain source-only status.</p><h3>Hand-drawn decorations</h3><div class="assets">${artworkLinks(tokens.artwork.decorations)}</div><h3>Inkling · one lilac shape, tiny ink features</h3><div class="assets">${artworkLinks(tokens.artwork.inkling)}</div></section>
<section class="rule two"><div><h2>05 · Application rules</h2><ul class="small"><li>Hierarchy comes from type, alignment and whitespace.</li><li>Course rows and progress sit directly on white.</li><li>Use one relevant paper detail, not a panel system.</li><li>Keep neutral utilities separate from hand-drawn artwork.</li><li>No gradients, textures, glossy rendering or heavy shadows.</li><li>Use the authored flame for a continuous-learning streak.</li></ul></div><div><h2>Unspecified stays explicit</h2><p class="small muted notice">Feedback palettes, body/learning type, form controls, pressed/loading states and responsive behavior are extensions awaiting further source/state review. Raw Figma tracking is recorded, not guessed. This is a system update, not a full screen/navigation port or accessibility certification.</p></div></section>
<footer>Generated from theme/*.ts · <a href="../../theme/tokens.json">Reference + runtime tokens</a> · <a href="../../docs/design-system/README.md">Guide and migration boundaries</a><br>Font families are bundled dependencies. Asset palettes and source measurements follow the supplied inspection.</footer>
</main><script>
const tabs = [...document.querySelectorAll('.nav [role=tab]')];
function selectTab(tab) { tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }); }
tabs.forEach((tab,i) => { tab.addEventListener('click', () => selectTab(tab)); tab.addEventListener('keydown', (event) => { let next; if(event.key==='ArrowRight')next=(i+1)%tabs.length; else if(event.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length; else if(event.key==='Home')next=0; else if(event.key==='End')next=tabs.length-1; else return; event.preventDefault(); selectTab(tabs[next]); tabs[next].focus(); }); });
</script></body></html>`;
const root = path.resolve(__dirname, '..');
const outputs = ['docs/design-system/index.html', 'app/memq/MemQ Design System.html'];
if (!process.argv.includes('--check')) {
  const previous = path.join(root, outputs[1]);
  const archive = path.join(root, 'docs/design-system/archive/editorial-v1.html');
  if (!fs.existsSync(archive) && fs.existsSync(previous)) { fs.mkdirSync(path.dirname(archive), { recursive: true }); fs.copyFileSync(previous, archive); }
}
for (const file of outputs) {
  const target = path.join(root, file);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target,'utf8') !== html) { console.error(`${file} is stale; run npm run design-system:build`); process.exitCode=1; }
  } else fs.writeFileSync(target, html);
}
