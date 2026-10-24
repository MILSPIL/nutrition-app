import { PRODUCTS_DB } from '../data/products.js';
import { itemMacros } from './mealItems.js';
import { planName, validatedPlanMatch } from './planCatalog.js';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const letters=Object.keys(PRODUCTS_DB);
const clean=(item,allocation,portion)=>{const {portion:old,rawCookedCoef,...rest}=item;return {...rest,planAllocation:allocation,...(portion!=null?{portion}:{})};};
const empty=(assignment,letter)=>({version:1,status:letter?'unresolved':'unallocated',assignment,...(letter?{letter}:{})});
export function validAllocation(a) {
 if(!a||typeof a!=='object'||Object.keys(a).some(k=>!['version','status','assignment','letter','referenceKey','referenceName','basis','conversion','normSource'].includes(k))||a.version!==1||!['auto','manual'].includes(a.assignment)) return false;
 if(a.status==='unallocated') return !a.letter&&!a.basis&&!a.conversion&&!a.referenceKey&&!a.referenceName&&!a.normSource;
 if(!letters.includes(a.letter)) return false;
 if(a.status==='unresolved') return !a.basis&&!a.conversion&&!a.referenceKey&&!a.referenceName&&!a.normSource;
 if(a.status!=='allocated'||!a.referenceKey||!a.referenceName||!['profile','catalog'].includes(a.normSource)||!positive(a.basis?.value)) return false;
 if(a.letter==='в') return a.referenceKey==='calorie:в'&&a.referenceName==='Вільний вибір'&&a.normSource==='catalog'&&a.basis.unit==='kcal'&&a.basis.state==='energy'&&a.conversion?.kind==='energy';
 const c=a.conversion;
 return a.basis.unit==='g'&&['raw','as_sold'].includes(a.basis.state)&&positive(c?.baseQuantity?.value)&&['g','ml','portion','package'].includes(c?.baseQuantity?.unit)&&positive(c?.baseMassGrams)&&positive(c?.factor);
}
function computedPercent(item) {
 const a=item.planAllocation;if(!validAllocation(a)||a.status!=='allocated') return null;
 if(a.letter==='в') {try{return itemMacros(item).cal/a.basis.value*100;}catch(_){return null;}}
 const c=a.conversion,q=item.quantity;
 if(!positive(q?.value)||q.unit!==c.baseQuantity.unit) return null;
 return c.baseMassGrams*q.value/c.baseQuantity.value*c.factor/a.basis.value*100;
}
export function allocationPercent(item) {
 const value=computedPercent(item);
 return value!=null&&finite(item.portion)&&Math.abs(value-item.portion)<=0.000001?value:null;
}
export function itemPlanPercent(item,group) {
 if(!letters.includes(group)) return null;
 if(item.planAllocation) return item.planAllocation.letter===group?allocationPercent(item):null;
 if(group==='в') {try{return itemMacros(item).cal/PRODUCTS_DB.в.calorieLimit*100;}catch(_){return null;}}
 return finite(item.portion)&&item.portion>=0?item.portion:null;
}
export function dailyPlanProgress(meals={}) {
 const result={letters:Object.fromEntries(letters.map(l=>[l,{percent:0,unknown:0,calories:0}])),unallocatedCount:0};
 for(const meal of Object.values(meals||{})) for(const [group,items] of Object.entries(meal||{})) for(const item of Array.isArray(items)?items:[]) {
  if(group==='voice'||!result.letters[group]) {result.unallocatedCount++;continue;}
  const cell=result.letters[group],percent=itemPlanPercent(item,group);
  if(percent==null) cell.unknown++;else cell.percent+=percent;
  try {cell.calories+=itemMacros(item).cal;}catch(_){}
 }
 return result;
}
function matchFamily(item,catalog) {
 if(Object.prototype.hasOwnProperty.call(item,'planMatch')) {
  const m=validatedPlanMatch(item.planMatch,catalog);
  return m?.certainty==='matched'?m.referenceId:null;
 }
 const exact=catalog.references.filter(r=>planName(r.name)===planName(item.name));
 const families=[...new Set(exact.map(r=>r.family))];
 return families.length===1?families[0]:null;
}
function allocate(item,reference,letter,assignment) {
 if(!letter) return clean(item,empty(assignment));
 if(letter==='в') {
  let calories;try{calories=itemMacros(item).cal;}catch(_){return clean(item,empty(assignment,letter));}
  return clean(item,{version:1,status:'allocated',letter,referenceKey:'calorie:в',referenceName:'Вільний вибір',basis:{value:PRODUCTS_DB.в.calorieLimit,unit:'kcal',state:'energy'},conversion:{kind:'energy'},normSource:'catalog',assignment},calories/PRODUCTS_DB.в.calorieLimit*100);
 }
 if(!reference?.norm) return clean(item,empty(assignment,letter));
 const q=item.quantity,choice=item.planChoice||{};
 const state=choice.consumedState||item.planMatch?.consumedState||(reference.coef===1?'as_sold':'unknown');
 if(reference.coef!==1&&!['raw','cooked'].includes(state)) return clean(item,empty(assignment,letter));
 let mass=choice.mass;
 if(!mass&&positive(choice.massGrams)) mass={baseQuantity:{...q},baseMassGrams:choice.massGrams};
 if(!mass&&q?.unit==='g') mass={baseQuantity:{...q},baseMassGrams:q.value};
 if(!mass&&q?.unit==='ml'&&positive(item.density)) mass={baseQuantity:{...q},baseMassGrams:q.value*item.density};
 if(!mass||mass.baseQuantity?.unit!==q?.unit||!positive(mass.baseMassGrams)||!positive(mass.baseQuantity?.value)||!positive(q?.value)) return clean(item,empty(assignment,letter));
 const allocation={version:1,status:'allocated',letter,referenceKey:reference.referenceKey,referenceName:reference.name,basis:{value:reference.norm,unit:'g',state:reference.basisState},conversion:{...mass,factor:state==='cooked'?1/reference.coef:1},normSource:reference.normSource,assignment};
 const result=clean(item,allocation);result.portion=computedPercent(result);
 // Підтверджена маса зберігається як незмінна пропорція, а не як поточна маса.
 if(choice.mass||positive(choice.massGrams)) {const {massGrams,...rest}=choice;result.planChoice={...rest,mass};}
 return result;
}
export function assignPlanItems(items,catalog,meals={}) {
 const totals=dailyPlanProgress(meals).letters,output=new Array(items.length);
 const order=[...items.keys()].sort((a,b)=>Number(items[b].planChoice?.assignment==='manual')-Number(items[a].planChoice?.assignment==='manual')||a-b);
 for(const index of order) {
  const item=items[index],choice=item.planChoice||{},manual=choice.assignment==='manual'&&(choice.letter===''||letters.includes(choice.letter)),family=matchFamily(item,catalog);
  let candidates=catalog.references.filter(r=>r.family===family);
  // Автоматичний вільний вибір ніколи не поглинає звичайні фрукти.
  if(!manual&&family?.startsWith('free:')&&family!=='free:anything') candidates=[];
  let result;
  if(manual) {
   const explicit=catalog.references.find(r=>r.referenceKey===choice.referenceKey&&r.letter===choice.letter);
   const ref=choice.referenceKey!==undefined?explicit:candidates.find(r=>r.letter===choice.letter);
   result=allocate(item,ref,choice.letter,'manual');
  } else if(candidates.length) {
   const alternatives=candidates.map(r=>({r,item:allocate(item,r,r.letter,'auto')}));
   const complete=alternatives.filter(x=>totals[x.r.letter].unknown===0);
   const pool=complete.length?complete:alternatives;
   const chosen=!complete.length?alternatives[0]:pool.find(x=>x.item.portion!=null&&totals[x.r.letter].percent+x.item.portion<=100+1e-9)||pool.find(x=>totals[x.r.letter].percent<100)||pool[0];
   result=chosen.item;
  } else result=clean(item,empty('auto'));
  output[index]=result;
  const a=result.planAllocation;if(a.letter) {if(a.status==='allocated') totals[a.letter].percent+=result.portion;else totals[a.letter].unknown++;}
 }
 return output;
}
export function persistedPlanItem(item) {
 const {planChoice,planMatch,...result}=item;
 return result;
}
export function allocationCounts(items) {return {
 planAssignedCount:items.filter(i=>i.planAllocation?.status==='allocated').length,
 planUnresolvedCount:items.filter(i=>i.planAllocation?.status!=='allocated').length,
 planManualCount:items.filter(i=>i.planAllocation?.assignment==='manual').length,
};}
export const percentText=value=>{const rounded=Math.round((value+Number.EPSILON)*10)/10;return rounded===100&&value!==100?`${value>100?'>':'<'}100%`:`${rounded}%`;};
export function invalidatePlanIdentity(item) {
 const {planMatch,portion,planAllocation,...rest}=item;
 const choice=item.planChoice;
 return {...rest,...(choice?.assignment==='manual'?{planChoice:{letter:choice.letter,assignment:'manual',referenceKey:''}}:{planChoice:undefined})};
}
