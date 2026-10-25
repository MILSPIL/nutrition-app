import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSnapshot, sameFreshness, modelDay } from './day-snapshot.mjs';
const day={revision:3,meals:{},notes:[]};
const plan=nutritionTargets=>({planContext:{profile:{nutritionTargets}}});
test('C04 independent targets on the same day never borrow owner defaults',async()=>{
 const owner=await confirmedSnapshot(day,plan({version:1,cal:2305,p:140,f:70,c:235}),'2026-01-02');
 const wife=await confirmedSnapshot(day,plan({version:1,cal:1800,p:95,f:55,c:200}),'2026-01-02');
 const unset=await confirmedSnapshot(day,{},'2026-01-02');
 assert.equal(owner.remaining.cal,2305);assert.equal(wife.remaining.cal,1800);
 assert.equal(wife.remaining.p,95);assert.equal(unset.targetsState,'unset');
 assert.deepEqual(unset.targets,{});assert.equal(Object.hasOwn(unset,'remaining'),false);assert.equal(Object.hasOwn(unset,'progress'),false);assert.deepEqual(unset.planProgress.letters,{});assert.equal(Object.hasOwn(modelDay(unset),'progress'),false);
 assert.equal(sameFreshness(owner.freshness,wife.freshness),false);
});
test('C04 partial targets leave remaining calories and absent macro targets unknown',async()=>{
 const snapshot=await confirmedSnapshot(day,plan({version:1,p:95}),'2026-01-02');
 assert.equal(snapshot.targetsState,'partial');assert.deepEqual(snapshot.remaining,{p:95});assert.deepEqual(snapshot.progress,{p:0});
 assert.equal(Object.hasOwn(snapshot.targets,'cal'),false);
 assert.equal(Object.hasOwn(snapshot.remaining,'cal'),false);
});
test('C04 norm edit invalidates advice even without a meal-day or catalog revision',async()=>{
 const before=await confirmedSnapshot(day,plan({version:1,cal:1800}),'2026-01-02');
 const after=await confirmedSnapshot(day,plan({version:1,cal:1900}),'2026-01-02');
 assert.equal(before.freshness.dayRevision,after.freshness.dayRevision);
 assert.equal(before.freshness.planFingerprint,after.freshness.planFingerprint);
 assert.equal(sameFreshness(before.freshness,after.freshness),false);
 const replay=await confirmedSnapshot(day,plan({cal:1800,version:1}),'2026-01-02');
 assert.equal(sameFreshness(before.freshness,replay.freshness),true);
});
test('C04 corrupted targets fail closed before advice rather than falling back',async()=>{
 for(const targets of [{version:1,cal:0},{version:1,p:NaN},{version:2,cal:1800}]){
  await assert.rejects(confirmedSnapshot(day,plan(targets),'2026-01-02'),/day_unavailable/);
 }
});
