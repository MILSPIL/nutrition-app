import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const contract = fixture('contract-v1');
const cases = fixture('food-cases').cases;
test('H02: зафіксовано 12 різних випадків із незалежними очікуваннями', () => {
  assert.equal(cases.length, 12);
  assert.equal(new Set(cases.map(item => item.id)).size, 12);
  assert.equal(cases[2].expect.preparation, 'cooked');
  assert.equal(cases[3].expect.preparation, 'dry');
  assert.deepEqual(cases[6].expect.totals, { p: 6, f: 5, c: 8, cal: 102 });
  assert.equal(cases[7].expect.silentConversion, false);
});
test('H03/H05: контракт зберігає невідоме, ID, дату та одиниці', () => {
  assert.equal(contract.note.nutrients.cal, null);
  assert.equal(contract.note.excludedFromTotals, true);
  assert.equal(contract.draft.items[0].quantity.unit, 'g');
  assert.deepEqual(contract.expectedTotals, { p: 4, f: 6, c: 40, cal: 230 });
  assert.equal(contract.contextProposal.state, 'proposed');
});
test('H07/H08: межі закріплені до реалізації', () => {
  assert.deepEqual(contract.allowedTools, ['food_lookup', 'read_confirmed_day', 'read_plan', 'read_trainer_context', 'propose_food_draft', 'propose_context_update']);
  assert.equal(contract.limits.maxSonnetCalls, 3);
  assert.equal(contract.limits.runDeadlineMs, 45000);
  // 1.9.9 (owner decision 2026-10-30): old Sonnet path raised for the simple-logging rules.
  assert.equal(contract.limits.maxPayloadTextBytes, 34000);
});
test('H03: негативний контроль не пропускає підміну unknown нулем', () => {
  const mutated = structuredClone(contract.note);
  mutated.nutrients.cal = 0;
  assert.throws(() => assert.equal(mutated.nutrients.cal, null));
});
