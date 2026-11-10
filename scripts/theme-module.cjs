/** Load pure TypeScript theme modules for generation/checks without a runtime framework. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function loadTheme(name) {
  const file = path.resolve(__dirname, '../theme', `${name}.ts`);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('exports', 'require', code)(exports, (request) => {
    if (!request.startsWith('./')) throw new Error(`Theme generator cannot import ${request}`);
    return loadTheme(request.slice(2));
  });
  return exports;
}
module.exports = { loadTheme };
