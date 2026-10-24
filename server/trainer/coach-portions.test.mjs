// Synthetic C03/C04 quantities are test values, not a food database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoodResolver } from './food-resolver.mjs';
import { patchDraft, commandFromDraft } from './drafts.mjs';
import { itemMacros, itemProblems, withQuantity, mergePhotoItem, normalizeAnalysis } from '../../src/services/mealItems.js';
import { applyDayCommand } from '../../src/services/mealCommands.js';
import { noteFromDraft, validFoodNote } from '../../src/services/foodNotes.js';
const nutrients={p:1,f:2,c:3,cal:60};
const candidate={id:'fixture:fruit',name:'Synthetic fruit',preparation:'raw',nutritionBasis:{value:100,unit:'g'},nutrients,source:{kind:'database',label:'Synthetic source',recordId:'fixture:fruit',version:1},portions:[{grams:120,amount:1,description:'small'},{grams:180,amount:1,description:'medium'},{grams:240,amount:1,description:'large'}]};
const make=options=>createFoodResolver({index:{lookup:()=>[candidate]},...options});
const raw=(patch={})=>({itemId:'synthetic-fruit-01',name:'Синтетичний плід',preparation:'raw',quantity:{value:1,unit:'portion'},source:{kind:'database',recordId:candidate.id,measureIndex:1},...patch});
const estimate=(patch={})=>raw({quantity:{value:180,unit:'g'},source:{kind:'estimate',estimateReason:'no_matching_source',assumptions:['Синтетична типова порція'],portionOrigin:{kind:'estimate',assumption:'Орієнтовна середня штука 180 г'},nutritionBasis:{value:100,unit:'g'},nutrients},...patch});
const patch=(previous,items,extra={})=>({...(previous?{draftId:previous.draftId}:{}),baseRevision:previous?.revision||0,targetDate:'2026-01-03',meal:1,items,...extra});
const offered=async options=>{const r=make(options);await r.lookup({query:'fruit',preparation:'raw'});return r;};

test('C03 trusted household measures convert 120/180/240 g and two pieces with code arithmetic',async()=>{
 const r=await offered();
 for(const [i,grams] of [120,180,240].entries()) {
  const item=r.resolve(raw({source:{kind:'database',recordId:candidate.id,measureIndex:i}}));
  assert.deepEqual(item.quantity,{value:grams,unit:'g'});
  assert.equal(itemMacros(item).cal,grams*.6);
  assert.equal(item.source.portionOrigin.kind,'catalog_measure');
  assert.match(item.source.portionOrigin.assumption,new RegExp(candidate.portions[i].description));
  assert.equal(item.estimated,false);
  assert.equal(item.source.measureIndex,undefined);
 }
 const two=r.resolve(raw({quantity:{value:2,unit:'portion'}}));
 assert.equal(two.quantity.value,360);assert.equal(itemMacros(two).cal,216);
});
test('C03 missing or forged measure cannot become exact grams',async()=>{
 const r=await offered();
 for(const measureIndex of [-1,12,0.5])assert.throws(()=>r.resolve(raw({source:{kind:'database',recordId:candidate.id,measureIndex}})),/invalid_household_measure/);
 assert.throws(()=>r.resolve(raw({source:{kind:'database',recordId:candidate.id,portionOrigin:{kind:'catalog_measure',assumption:'invented'}}})),/invalid_household_measure/);
 assert.equal(r.resolve(raw({source:{kind:'database',recordId:candidate.id}})).nutritionStatus,'unknown');
});
test('C03 estimate of mass is distinct from nutrients and survives add/reload; precise 150 g keeps estimated nutrients',async()=>{
 const r=make();const item=r.resolve(estimate());
 assert.deepEqual(itemMacros(item),{p:1.8,f:3.6,c:5.4,cal:108});
 let draft=patchDraft(null,patch(null,[estimate()]),{resolve:r.resolve});
 const save=await commandFromDraft(draft);
 const result=applyDayCommand({},save.command,save.hash);
 const read=JSON.parse(JSON.stringify(result.day)).meals[1].voice[0];
 assert.deepEqual(read.source,item.source);assert.equal(read.estimated,true);
 draft=patchDraft(draft,patch(draft,[{itemId:item.itemId,quantity:{value:150,unit:'g'}}]),{manual:true});
 assert.equal(itemMacros(draft.items[0]).cal,90);
 assert.equal(draft.items[0].source.portionOrigin.kind,'user');
 assert.equal(draft.items[0].estimated,true);
 assert.equal(withQuantity(item,150).source.portionOrigin.kind,'user');
});
test('C03 estimated mass on exact source stays approximate; changing to measured mass removes only mass estimate',async()=>{
 const r=await offered();const input=raw({quantity:{value:180,unit:'g'},source:{kind:'database',recordId:candidate.id,portionOrigin:{kind:'estimate',assumption:'Орієнтовна маса, ще не зважено'}}});
 const item=r.resolve(input);assert.equal(item.estimated,true);assert.equal(item.source.kind,'database');
 const measured=withQuantity(item,150);assert.equal(measured.estimated,false);assert.equal(measured.source.portionOrigin.kind,'user');
});
test('C03 label replaces nutrients but never promotes estimated eaten mass to exact',()=>{
 const r=make({photos:[{ref:'photo-synthetic',itemId:'synthetic-fruit-01'}]});
 const first=patchDraft(null,patch(null,[estimate()]),{resolve:r.resolve});
 const label=raw({quantity:{value:900,unit:'g'},source:{kind:'label',photoRef:'photo-synthetic',nutritionBasis:{value:100,unit:'g'},nutrients}});
 const next=patchDraft(first,patch(first,[label]),{resolve:r.resolve}).items[0];
 assert.equal(next.quantity.value,180);assert.equal(next.estimated,true);assert.equal(next.source.portionOrigin.kind,'estimate');
 const photo={...label,source:{kind:'label',label:'Етикетка'}};
 const merged=mergePhotoItem(first.items[0],{items:[{...photo,nutritionBasis:photo.source.nutritionBasis||{value:100,unit:'g'},nutrients}],unparsed:[]});
 assert.equal(merged.estimated,true);assert.deepEqual(merged.source.portionOrigin,first.items[0].source.portionOrigin);
});
test('C03 complete recipe estimate allowed only with reason, known preparation and visible assumptions',()=>{
 const r=make();
 assert.equal(r.resolve(estimate({preparation:'cooked',source:{...estimate().source,estimateReason:'recipe_estimate'}})).nutritionStatus,'complete');
 const missing=estimate();delete missing.source.estimateReason;
 assert.throws(()=>r.resolve(missing),/estimate_reason_required/);
 assert.equal(r.resolve(estimate({preparation:'unknown'})).nutritionStatus,'unknown');
 assert.throws(()=>r.resolve(estimate({source:{...estimate().source,estimateReason:'invented'}})),/estimate_reason_required/);
});
test('C03 partial label cannot be filled with estimated macros, and its note preserves portion provenance',()=>{
 const r=make({photos:[{ref:'photo-synthetic',itemId:'synthetic-fruit-01'}]});
 const first=patchDraft(null,patch(null,[raw({quantity:{value:180,unit:'g'},source:{kind:'label',photoRef:'photo-synthetic',nutritionBasis:{value:100,unit:'g'},nutrients:{...nutrients,p:null},portionOrigin:{kind:'estimate',assumption:'Приблизна вага'}}})]),{resolve:r.resolve});
 const next=patchDraft(first,patch(first,[estimate()]),{resolve:r.resolve});
 assert.equal(next.items[0].nutritionStatus,'unknown');assert.equal(next.items[0].nutrients.p,null);assert.equal(next.items[0].source.kind,'label');
 const note=JSON.parse(JSON.stringify(noteFromDraft(next.items[0],next.draftId,'Тест')));
 assert.equal(validFoodNote(note),true);assert.equal(note.provenance.portionOrigin.kind,'estimate');
 assert.equal(validFoodNote({...note,provenance:{...note.provenance,extra:'forged'}}),false);
 assert.equal(validFoodNote({...note,provenance:{...note.provenance,estimateReason:'recipe_estimate'}}),false);
});
test('C03 raw/cooked and g/ml mismatches cannot be overwritten with complete-looking model numbers',async()=>{
 const r=await offered();
 assert.throws(()=>r.resolve(raw({preparation:'cooked'})),/food_source_not_offered/);
 const mismatch=estimate({quantity:{value:200,unit:'ml'}});
 assert.equal(r.resolve(mismatch).nutritionStatus,'unknown');
});
test('C04 manual choice survives quantity/meal but resets reference on source identity change',async()=>{
 const r=await offered({photos:[{ref:'photo-synthetic',itemId:'synthetic-fruit-01'}]});
 let d=patchDraft(null,patch(null,[estimate()]),{resolve:r.resolve});
 const choice={assignment:'manual',letter:'з',referenceKey:'synthetic-fruit-reference'};
 d=patchDraft(d,patch(d,[{itemId:'synthetic-fruit-01',planChoice:choice}]),{manual:true});
 d=patchDraft(d,patch(d,[{itemId:'synthetic-fruit-01',quantity:{value:150,unit:'g'}}],{meal:2}),{manual:true});
 assert.deepEqual(d.items[0].planChoice,choice);
 const label=raw({quantity:{value:900,unit:'g'},source:{kind:'label',photoRef:'photo-synthetic',nutritionBasis:{value:100,unit:'g'},nutrients}});
 d=patchDraft(d,patch(d,[label],{meal:2}),{resolve:r.resolve});
 assert.deepEqual(d.items[0].planChoice,{assignment:'manual',letter:'з',referenceKey:''});
 const other={...candidate,id:'fixture:second',source:{...candidate.source,recordId:'fixture:second'}};
 const second=make({index:{lookup:()=>[candidate,other]}});await second.lookup({query:'fruit',preparation:'raw'});
 let x=patchDraft(null,patch(null,[raw()]),{resolve:second.resolve});
 x=patchDraft(x,patch(x,[{itemId:raw().itemId,planChoice:choice}]),{manual:true});
 x=patchDraft(x,patch(x,[raw({source:{kind:'database',recordId:other.id,measureIndex:1}})]),{resolve:second.resolve});
 assert.equal(x.items[0].planChoice.referenceKey,'');
});
test('C03 provenance normalization is bounded; legacy source remains readable, unknown keys fail',()=>{
 const base=make().resolve(estimate());
 assert.equal(itemProblems({...base,source:{kind:'estimate'}}).length,0);
 for(const origin of [{kind:'bad',assumption:'x'},{kind:'estimate',assumption:'x'.repeat(401)},{kind:'estimate',assumption:'x',extra:true}]) {
  assert.throws(()=>make().resolve(estimate({source:{...estimate().source,portionOrigin:origin}})),/invalid_portion_origin/);
 }
 const normalized=normalizeAnalysis({items:[base],unparsed:[]},()=>base.itemId).items[0];
 assert.deepEqual(normalized.source.portionOrigin,base.source.portionOrigin);
 assert.equal(normalized.source.estimateReason,'no_matching_source');
 assert.ok(itemProblems({...base,source:{...base.source,portionOrigin:{kind:'estimate',assumption:''}}}).length);
});


test('C03 catalog amount ratio is trusted and an unresolved preparation stays a note after manual quantity',async()=>{
 const r=await offered({index:{lookup:()=>[{...candidate,portions:[{grams:240,amount:2,description:'дві малі штуки'}]}]}});
 const item=r.resolve(raw({source:{kind:'database',recordId:candidate.id,measureIndex:0}}));
 assert.equal(item.quantity.value,120);assert.equal(itemMacros(item).cal,72);
 const u=make();let draft=patchDraft(null,patch(null,[estimate({preparation:'unknown'})]),{resolve:u.resolve});
 draft=patchDraft(draft,patch(draft,[{itemId:raw().itemId,quantity:{value:150,unit:'g'}}]),{manual:true});
 assert.equal(draft.items[0].nutritionStatus,'unknown');assert.ok(itemProblems(draft.items[0]).length);
});
test('C03 a partial photographed label also outranks a generic full database candidate',async()=>{
 const r=await offered({photos:[{ref:'photo-synthetic',itemId:raw().itemId}]});
 const label=raw({quantity:{value:180,unit:'g'},source:{kind:'label',photoRef:'photo-synthetic',nutritionBasis:{value:100,unit:'g'},nutrients:{...nutrients,p:null}}});
 let d=patchDraft(null,patch(null,[label]),{resolve:r.resolve});
 d=patchDraft(d,patch(d,[raw()]),{resolve:r.resolve});
 assert.equal(d.items[0].source.kind,'label');assert.equal(d.items[0].nutrients.p,null);assert.equal(d.items[0].nutritionStatus,'unknown');
});

test('C04 the prepared command fences the confirmed day revision until the actual writer commits',async()=>{
 const r=make();const d=patchDraft(null,patch(null,[estimate()]),{resolve:r.resolve});
 const saved=await commandFromDraft(d,{dayRevision:4});
 assert.equal(saved.command.expectedRevision,4);
 assert.throws(()=>applyDayCommand({revision:5},saved.command,saved.hash),/revision_conflict/);
 assert.equal(applyDayCommand({revision:4},saved.command,saved.hash).day.revision,5);
 await assert.rejects(commandFromDraft(d,{dayRevision:-1}),/invalid_day_revision/);
});

test('review P2 a model-supplied gram value without literal user weight remains an estimate',async()=>{
 const r=await offered();
 for(const portionOrigin of [undefined,{kind:'user',assumption:'Модель стверджує точність'}]) {
  const source={kind:'database',recordId:candidate.id,...(portionOrigin?{portionOrigin}:{})};
  const item=r.resolve(raw({quantity:{value:180,unit:'g'},source}),{userText:'З’їв один плід'});
  assert.equal(item.source.portionOrigin.kind,'estimate');assert.equal(item.estimated,true);
 }
 const exact=r.resolve(raw({quantity:{value:150,unit:'g'},source:{kind:'database',recordId:candidate.id}}),{userText:'З’їв плід, 150 г'});
 assert.equal(exact.source.portionOrigin.kind,'user');assert.equal(exact.estimated,false);
 const approximate=r.resolve(raw({quantity:{value:150,unit:'g'},source:{kind:'database',recordId:candidate.id}}),{userText:'З’їв приблизно 150 г'});
 assert.equal(approximate.source.portionOrigin.kind,'estimate');assert.equal(approximate.estimated,true);
});
test('review P2 a model quantity-only size answer cannot claim a user-measured weight',()=>{
 const r=make();let d=patchDraft(null,patch(null,[estimate()]),{resolve:r.resolve});
 d=patchDraft(d,patch(d,[{itemId:raw().itemId,quantity:{value:240,unit:'g'}}],{originalText:'Великий'}),{resolve:r.resolve});
 assert.equal(d.items[0].source.portionOrigin.kind,'estimate');
 d=patchDraft(d,patch(d,[{itemId:raw().itemId,quantity:{value:150,unit:'g'}}],{originalText:'150 грамів'}),{resolve:r.resolve});
 assert.equal(d.items[0].source.portionOrigin.kind,'user');assert.equal(d.items[0].estimated,true);
});
test('review P2 full photographed label wins over same-food model estimate; another named food or label can replace',()=>{
 const r=make({photos:[{ref:'photo-synthetic',itemId:raw().itemId},{ref:'photo-new',itemId:raw().itemId}]});
 const label=raw({quantity:{value:180,unit:'g'},source:{kind:'label',photoRef:'photo-synthetic',nutritionBasis:{value:100,unit:'g'},nutrients}});
 const original=patchDraft(null,patch(null,[label]),{resolve:r.resolve});
 const inflated=estimate({source:{...estimate().source,nutrients:{...nutrients,cal:120}}});
 const same=patchDraft(original,patch(original,[inflated]),{resolve:r.resolve});
 assert.equal(same.items[0].source.kind,'label');assert.equal(same.items[0].nutrients.cal,60);
 const other=patchDraft(original,patch(original,[{...inflated,name:'Інша страва'}],{originalText:'Це інша страва'}),{resolve:r.resolve});
 assert.equal(other.items[0].source.kind,'estimate');assert.equal(other.items[0].nutrients.cal,120);
 const renamed=patchDraft(original,patch(original,[{...inflated,name:'Модель вигадала нову назву'}]),{resolve:r.resolve});
 assert.equal(renamed.items[0].source.kind,'label');assert.equal(renamed.items[0].nutrients.cal,60);
 const newPhoto=patchDraft(original,patch(original,[{...label,source:{...label.source,photoRef:'photo-new',nutrients:{...nutrients,cal:75}}}]),{resolve:r.resolve});
 assert.equal(newPhoto.items[0].source.kind,'label');assert.equal(newPhoto.items[0].nutrients.cal,75);
});
test('review P2 complete item provenance rejects unknown source keys while legacy source remains valid',()=>{
 const r=make();const item=r.resolve(estimate());
 assert.equal(itemProblems({...item,source:{kind:'estimate'}}).length,0);
 assert.ok(itemProblems({...item,source:{...item.source,modelSecret:'unexpected'}}).length);
 assert.throws(()=>applyDayCommand({}, {type:'append',submissionId:'synthetic-unknown-source',meal:1,items:[{...item,source:{...item.source,modelSecret:'unexpected'}}]},'synthetic-hash'),/invalid_item/);
});

test('review P2 a literal mass belongs to its food, not another named item in the same message',async()=>{
 const r=await offered();
 const food=name=>raw({name,quantity:{value:150,unit:'g'},source:{kind:'database',recordId:candidate.id}});
 for(const userText of [
  'З’їв 150 г гречки і одне яблуко без зважування',
  'З’їв 150 г гречки, одне яблуко',
  '150 г гречки. Яблуко було середнім',
 ]) {
  const apple=r.resolve(food('Яблуко'),{userText});
  assert.equal(apple.source.portionOrigin.kind,'estimate',userText);
  assert.equal(apple.estimated,true,userText);
 }
 for(const userText of ['З’їв 150 г яблука','З’їв яблуко, 150 г','150 г гречки і 150 г яблука']) {
  const apple=r.resolve(food('Яблуко'),{userText});
  assert.equal(apple.source.portionOrigin.kind,'user',userText);
  assert.equal(apple.estimated,false,userText);
 }
 assert.equal(r.resolve(food('Гречка'),{userText:'З’їв 150 г гречки і одне яблуко'}).source.portionOrigin.kind,'user');
 assert.equal(r.resolve(food('Кукурудзяний хліб'),{userText:'150 г кукурудзи і хліб без зважування'}).source.portionOrigin.kind,'estimate');
 assert.equal(r.resolve(food('Кукурудзяний хліб'),{userText:'150 г кукурудзяного хліба'}).source.portionOrigin.kind,'user');
});

test('review P2 negated and alternative masses never become a precise user portion',async()=>{
 const r=await offered();
 const food=value=>raw({name:'Яблуко',quantity:{value,unit:'g'},source:{kind:'database',recordId:candidate.id}});
 for(const userText of ['Не 150 г, а 180 г яблука','Яблуко не 150 г','Яблуко 150 г або 180 г','Приблизно 150 г яблука','Яблуко 150 г без зважування','100-150 г яблука','Десь 150 г яблука','До 150 г яблука','Яблуко 150 г?'])
  assert.equal(r.resolve(food(150),{userText}).source.portionOrigin.kind,'estimate',userText);
 assert.equal(r.resolve(food(180),{userText:'Не 150 г, а 180 г яблука'}).source.portionOrigin.kind,'user');
});

test('review P2 quantity replies require a canonical single item or name binding',()=>{
 const r=make();
 const apple=estimate({name:'Яблуко'}),oats=estimate({itemId:'synthetic-oats-02',name:'Гречка'});
 const two=patchDraft(null,patch(null,[apple,oats]),{resolve:r.resolve});
 const update=(draft,originalText)=>patchDraft(draft,patch(draft,[{itemId:apple.itemId,quantity:{value:150,unit:'g'}}],{originalText}),{resolve:r.resolve});
 assert.equal(update(two,'150 г').items[0].source.portionOrigin.kind,'estimate');
 assert.equal(update(two,'150 г гречки').items[0].source.portionOrigin.kind,'estimate');
 assert.equal(update(two,'Яблука було 150 г').items[0].source.portionOrigin.kind,'user');
 const one=patchDraft(null,patch(null,[apple]),{resolve:r.resolve});
 assert.equal(update(one,'150 грамів').items[0].source.portionOrigin.kind,'user');
 assert.equal(update(one,'Ще з’їв 150 г гречки').items[0].source.portionOrigin.kind,'estimate');
 assert.equal(update(one,'Не 150 г, а 180 г').items[0].source.portionOrigin.kind,'estimate');
});
