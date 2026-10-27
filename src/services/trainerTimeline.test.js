import { trainerTimeline } from './trainerTimeline';

test('old saved receipt precedes new advice and duplicate words retain distinct identity', () => {
  const value = trainerTimeline({ messages: [
    { id: 'n1', turnId: 'first', role: 'user', content: 'Яблуко' },
    { id: 'n2', turnId: 'first', role: 'assistant', content: 'Прев’ю' },
    { id: 'n3', turnId: 'second', role: 'user', content: 'Яблуко' },
  ], drafts: [{ draftId: 'd1', turnId: 'first', state: 'saved' }], latestTurn: { turnId: 'second', text: 'Яблуко' } });
  expect(value.entries.map(e => e.message?.id || e.draft.draftId)).toEqual(['n1', 'n2', 'd1', 'n3']);
  expect(value.entries[2].compact).toBe(true);
});
test('edited draft follows latest exact origin; old unanchored drafts stay before conversation', () => {
  const value = trainerTimeline({ messages: [{ id: 'r', turnId: 'correction', content: '150 г' }], drafts: [
    { draftId: 'edited', turnId: 'first', originTurnIds: ['correction'], state: 'ready' },
    { draftId: 'legacy', turnId: 'unavailable', state: 'ready' },
    { draftId: 'lost-save', state: 'unknown' },
  ], latestTurn: { turnId: 'correction', text: '150 г' } });
  expect(value.entries.map(e => e.message?.id || e.draft.draftId)).toEqual(['r', 'edited']);
  expect(value.entries[1].collapsed).toBe(false);
  expect(value.historyDrafts.map(e => [e.draft.draftId, e.collapsed])).toEqual([['legacy', true], ['lost-save', false]]);
});
test('pending fallback uses identity even if previous text is identical', () => {
  const value = trainerTimeline({ messages: [{ id: 'old', turnId: 'old', content: 'Так' }], latestTurn: { turnId: 'new', text: 'Так' } });
  expect(value.entries.map(e => e.message.turnId)).toEqual(['old', 'new']);
});
