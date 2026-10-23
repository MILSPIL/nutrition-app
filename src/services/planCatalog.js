import { PRODUCTS_DB, DEFAULT_PORTIONS } from '../data/products';
import { LETTER_GROUPS, STANDARD_FAMILIES, PLAN_CATALOG_VERSION } from '../data/planReferences';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
export const planName=name=>String(name||'').normalize('NFKC').trim().toLocaleLowerCase('uk').replace(/\s+/g,' ');
// Неприватний стабільний ідентифікатор. Колізія відключає AI-каталог цілком.
function nameHash(text) { let a=2166136261,b=2246822507; for(const c of text){a=Math.imul(a^c.codePointAt(0),16777619);b=Math.imul(b^c.codePointAt(0),3266489909);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0'); }
const stable=value=>JSON.stringify(value,function(k,v){return v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v;});
export function buildPlanCatalog({profile={},globalCustomProducts={},productOverrides={}}={}) {
 const references=[], hidden=new Set(profile.hiddenProducts||[]), api=new Map();let collision=false,invalidName=false;
 for(const [letter,category] of Object.entries(PRODUCTS_DB)) {
  const sources=[['standard',category.products],['global',globalCustomProducts[letter]||[]],['profile',profile.customProducts?.[letter]||[]]];
  for(const [source,products] of sources) {
   if(!Array.isArray(products)) {invalidName=true;continue;}
   for(const [index,original] of products.entries()) {
   if(source!=='standard'&&hidden.has(original?.name)) continue;
   if(typeof original?.name!=='string'||!original.name.trim()) {invalidName=true;continue;}
   const p={...original,...productOverrides[original.name]},name=original.name,group=LETTER_GROUPS[letter];
   const family=source==='standard'?`${group}:${STANDARD_FAMILIES[group][index]}`:`custom:${source}:${nameHash(letter+'|'+name)}`;
   const refId=family,referenceKey=`${family}:${letter}`;
   const norm=own(profile.portions,name)?profile.portions[name]:own(p,'raw')?p.raw:DEFAULT_PORTIONS[name];
   const basisState=['carbs','protein','vegetables'].includes(group)?'raw':'as_sold';
   const ref={refId,referenceKey,family,name,letter,group,basisState,norm:positive(norm)?norm:null,normSource:own(profile.portions,name)?'profile':'catalog',coef:positive(p.coef)?p.coef:1,source};
   if(source!=='standard'&&references.some(previous=>previous.referenceKey===referenceKey&&stable(previous)===stable(ref))) continue;
   references.push(ref);
   // Один запис сім'ї, норми та літери залишаються лише на клієнті.
   const entry={refId,name:source==='standard'&&letter==='ж'?name.replace(/ \(ж\)$/,''):name,group,basisState};
   if(api.has(refId)&&source!=='standard') collision=true;
   if(!api.has(refId)) api.set(refId,entry);
  }
  }
 }
 const names=new Map();
 for(const r of references) {const key=planName(r.name);if(!names.has(key))names.set(key,new Set());names.get(key).add(r.family);}
 for(const r of references) r.ambiguous=names.get(planName(r.name)).size>1;
 const compact=[...api.values()];
 const bytes=new TextEncoder().encode(JSON.stringify(compact)).length;
 const overLimit=invalidName||collision||compact.length>200||bytes>32768||compact.some(x=>x.name.length>160);
 // Тільки дані, що визначають план. Відомості про їжу, власника, дати і вагу виключено.
 const projection={version:PLAN_CATALOG_VERSION,standard:PRODUCTS_DB,portions:profile.portions||{},custom:references.filter(r=>r.source!=='standard'),hidden:[...hidden].sort(),overrides:productOverrides,free:PRODUCTS_DB.в.calorieLimit};
 return {references,apiCatalog:overLimit?null:compact,overLimit,bytes,projection:JSON.parse(JSON.stringify(projection))};
}
export async function planFingerprint(context) {
 const catalog=context?.references?context:buildPlanCatalog(context);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(catalog.projection))))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validatedPlanMatch(match,catalog) {
 if(!match||Object.keys(match).sort().join(',')!=='certainty,consumedState,referenceId'||!['raw','cooked','as_sold','unknown'].includes(match.consumedState)||!['matched','uncertain'].includes(match.certainty)||!catalog?.apiCatalog?.some(r=>r.refId===match.referenceId)||catalog.references.some(r=>r.refId===match.referenceId&&r.ambiguous)) return null;
 return {referenceId:match.referenceId,consumedState:match.consumedState,certainty:match.certainty};
}
