const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/DesignAsset.tsx'),'utf8');
const sf = ts.createSourceFile('DesignAsset.tsx', source, ts.ScriptTarget.Latest, true);
let count = 0;
function visit(node) {
  if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer)) {
    const properties = node.initializer.properties;
    const read = name => properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(sf)===name)?.initializer;
    const module = read('module'), width = read('width'), height = read('height');
    if (module && width && height && ts.isCallExpression(module)) {
      const arg = module.arguments[0];
      assert(ts.isStringLiteral(arg));
      const file = path.resolve(root, 'components', arg.text);
      assert(fs.statSync(file).size > 0, `Empty source asset: ${file}`);
      const svg = fs.readFileSync(file, 'utf8');
      const tag = svg.match(/<svg\b[^>]*>/)?.[0];
      assert(tag, `Invalid SVG: ${file}`);
      assert.equal(Number(tag.match(/\bwidth="([\d.]+)"/)?.[1]), Number(width.getText(sf)));
      assert.equal(Number(tag.match(/\bheight="([\d.]+)"/)?.[1]), Number(height.getText(sf)));
      count++;
    }
  }
  ts.forEachChild(node,visit);
}
visit(sf);
assert.equal(count, 27);
assert(!source.includes('figma.com/api/mcp/asset'));
console.log(`${count} original runtime SVG files are non-empty and retain their root dimensions.`);
