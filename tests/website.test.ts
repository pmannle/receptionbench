import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const modelUrl = pathToFileURL(`${process.cwd()}/website/model.mjs`).href;
test('website demonstrations explicitly separate missing, failed and passing evidence', async () => {
  const { examples, selectExample } = await import(modelUrl);
  assert.equal(examples.length, 3);
  assert.deepEqual(new Set(examples.map((item: { verdict: string }) => item.verdict)), new Set(['Pass', 'Fail', 'Inconclusive']));
  for (const example of examples) {
    assert.equal(example.simulated, true);
    assert.ok(example.receipts.length >= 3);
    assert.equal(selectExample(example.id), example);
  }
  assert.equal(selectExample('unknown'), examples[0]);
});
test('participation brief preserves draft status, role and evidence requirements', async () => {
  const { createBrief } = await import(modelUrl);
  const brief = createBrief({ role: 'Adapter author', system: 'Example system', profile: 'Booking-link handoff' });
  assert.match(brief, /Example system/);
  assert.match(brief, /Adapter author/);
  assert.match(brief, /Booking-link handoff/);
  assert.match(brief, /simulated/i);
  assert.match(brief, /independent hidden/i);
  assert.match(brief, /No information has been submitted/);
});
test('static site is labelled, has no remote scripts and resolves its section anchors', () => {
  const html = readFileSync('website/index.html', 'utf8');
  assert.match(html, /Simulated evidence/);
  assert.match(html, /Receptionaly/);
  assert.match(html, /M2/);
  assert.ok(!/<script[^>]*src=["']https?:/.test(html));
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(match[1]), `missing anchor ${match[1]}`);
});
test('general downloadable brief matches the maintained participation content', async () => {
  const { createBrief } = await import(modelUrl);
  assert.equal(readFileSync('website/assets/participation-brief.txt', 'utf8'), createBrief({ role: 'To be supplied', system: '', profile: 'To be supplied' }));
});
test('public participation destinations work without JavaScript and match configuration', async () => {
  const { destinations } = await import(pathToFileURL(`${process.cwd()}/website/config.mjs`).href);
  assert.equal(destinations.repositoryUrl, 'https://github.com/pmannle/receptionbench');
  assert.equal(destinations.contactEmail, 'phil.mannle@gmail.com');
  const html = readFileSync('website/index.html', 'utf8');
  assert.ok(html.includes(`href="${destinations.repositoryUrl}/issues/new/choose"`));
  assert.ok(html.includes(`href="mailto:${destinations.contactEmail}"`));
  assert.doesNotMatch(html, /destinations are not configured/);
});
test('public specification excludes the source-specific inventory and licenses declare separate scopes', () => {
  const spec = readFileSync('specifications.md', 'utf8');
  assert.doesNotMatch(spec, /\/(?:Users|home)\/[^\s]+|source-specific repository paths|agent\/app\/|tests\/utils\//);
  assert.match(spec, /source-neutral/);
  assert.match(readFileSync('LICENSE', 'utf8'), /Version 2.0, January 2004/);
  const dataLicense = readFileSync('LICENSE-DATA', 'utf8');
  assert.match(dataLicense, /SPDX-License-Identifier: CC0-1.0/);
  assert.match(dataLicense, /fixtures\/\*\*\/\*\.json/);
  assert.match(dataLicense, /creativecommons.org\/publicdomain\/zero\/1.0\/legalcode.en/);
});
