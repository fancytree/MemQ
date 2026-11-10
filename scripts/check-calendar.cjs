const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const api = {};
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/calendar.ts'), 'utf8');
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(api);
const october = api.calendarCells(2026, 9);
assert.equal(october[0], null);
assert.equal(october[3].getDate(), 1); // Monday-first grid; October begins on Thursday.
assert.equal(october.filter(Boolean).length, 31);
assert.equal(api.calendarCells(2024, 1).filter(Boolean).length, 29);
assert.equal(api.calendarCells(2026, 1).filter(Boolean).length, 28);
assert.equal(api.calendarCells(2026, 2).length, 42); // Six-week month.
const next = api.shiftCalendarMonth(new Date(2026, 11, 31), 1);
assert.equal(next.getFullYear(), 2027);
assert.equal(next.getMonth(), 0);
assert.equal(next.getDate(), 1);
const previous = api.shiftCalendarMonth(new Date(2026, 0, 31), -1);
assert.equal(previous.getFullYear(), 2025);
assert.equal(previous.getMonth(), 11);
assert(api.sameCalendarDay(new Date(2026, 9, 28, 0), new Date(2026, 9, 28, 23)));
assert(!api.sameCalendarDay(null, new Date()));
assert(!api.sameCalendarDay(new Date(2026, 9, 28), new Date(2026, 9, 29)));
for (const day of api.calendarCells(2026, 2).filter(Boolean)) assert.equal(day.getHours(), 12);
console.log('Calendar checks passed: Monday-first layout, leap years, six-week months, year rollover and local-day selection.');
