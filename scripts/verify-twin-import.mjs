// Verify that formatting/integration did not alter the supplied geometry or math.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

function loadPure(path) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Math }, { filename: path, timeout: 1000 });
  return exports;
}
const supplied = loadPure('vendor/digital-twin-g300/src/twin/whatif.ts');
const integrated = loadPure('src/imported-twin/twin/whatif.ts');
for (const preset of supplied.PRESETS) {
  const equivalent = integrated.PRESETS.find(p => p.id === preset.id);
  assert(equivalent, `Missing preset ${preset.id}`);
  const before = supplied.evaluateAll(preset.apply(supplied.defaultParams()));
  const after = integrated.evaluateAll(equivalent.apply(integrated.defaultParams()));
  assert.equal(JSON.stringify(after), JSON.stringify(before), preset.id);
}
// The drilling cycle intentionally replaces the supplied milling cycle.
// Its trajectories and blank replacement are validated in cycle.test.ts.
const geometry = path => JSON.parse(fs.readFileSync(path, 'utf8'));
assert.deepEqual(geometry('src/imported-twin/three/generated/g300-geometry.json'), geometry('vendor/digital-twin-g300/src/three/generated/g300-geometry.json'));
console.log(`Preserved: generated geometry, ${supplied.PRESETS.length} presets; drilling cycle tested separately.`);
