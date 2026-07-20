import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('grundkrav: språk, viewport, titel, beskrivning', () => {
  assert.ok(html.includes('<html lang="sv">'));
  assert.ok(html.includes('name="viewport"'));
  assert.ok(html.includes('<title>Arbixit'));
  assert.ok(html.includes('name="description"'));
});

test('favicon är länkad och finns', () => {
  assert.ok(html.includes('assets/favicon.svg'));
  assert.ok(existsSync(join(root, 'assets', 'favicon.svg')));
});

test('tillgänglighet: skip-länk, noscript-fallback, reduced motion', () => {
  assert.ok(html.includes('class="skip"'));
  assert.ok(html.includes('<noscript>'));
  assert.ok(html.includes('prefers-reduced-motion'));
});

test('pusslet renderas ur samma kantprofil som ikonmallen', () => {
  assert.ok(html.includes('function piecePath'));
  assert.ok(html.includes('0.086538'), 'halsbredd 72/416');
  assert.ok(html.includes('0.134615'), 'knoppbredd 112/416');
});

test('grafisk profil: godkända färger används', () => {
  for (const hex of ['#0F3D4C', '#2AB3A6', '#E8A13B', '#F4EFE8', '#26262B']) {
    assert.ok(html.includes(hex), `saknar ${hex}`);
  }
});

test('designunderlaget ligger orört i design/', () => {
  for (const f of ['Arbixit Pussel.dc.html', 'INSTRUKTION.md', 'support.js', 'arbixit-logo.svg']) {
    assert.ok(existsSync(join(root, 'design', f)), `saknar design/${f}`);
  }
});

test('inga hemligheter i sajtfilerna', () => {
  assert.ok(!/api[_-]?key|secret|password|ghp_|gho_/i.test(html));
});
