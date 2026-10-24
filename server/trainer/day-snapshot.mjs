import { createHash } from 'node:crypto';
import { itemMacros } from '../../src/services/mealItems.js';
import { dailyPlanProgress } from '../../src/services/planAllocation.js';
import { buildPlanCatalog, planFingerprint } from '../../src/services/planCatalog.js';
import { fail, stableJSON } from './limits.mjs';
// Same approved goals as the existing main screen; this does not change the plan.
export const DAY_TARGETS=Object.freeze({cal:2305,p:140,f:70,c:235});
const hash=value=>createHash('sha256').update(stableJSON(value)).digest('hex');
export async function confirmedSnapshot(day,plan,targetDate) {
 if(!day||typeof day!=='object'||!plan||typeof plan!=='object')fail('day_unavailable',503);
 const meals=day.meals||{},notes=day.notes||[],totals={p:0,f:0,c:0,cal:0};
 let invalidItems=0;
 for(const meal of Object.values(meals))for(const items of Object.values(meal||{}))for(const item of Array.isArray(items)?items:[]){
  try {const macros=itemMacros(item);for(const key of Object.keys(totals)){if(!Number.isFinite(macros[key]))throw Error();}for(const key of Object.keys(totals))totals[key]+=macros[key];}
  catch {invalidItems++;}
 }
 const catalog=plan.catalog||buildPlanCatalog(plan.planContext||{}), fingerprint=await planFingerprint(catalog);
 const notesRevision=hash([...notes].sort((a,b)=>String(a.noteId||a.itemId).localeCompare(String(b.noteId||b.itemId)))),dayRevision=Number.isSafeInteger(day.revision)&&day.revision>=0?day.revision:0;
 const freshness={targetDate,dayRevision,planFingerprint:fingerprint,notesRevision};
 return {...day,targetDate,meals,notes,revision:dayRevision,notesRevision,planFingerprint:fingerprint,totals,
  targets:DAY_TARGETS,remaining:Object.fromEntries(Object.keys(totals).map(k=>[k,DAY_TARGETS[k]-totals[k]])),
  progress:dailyPlanProgress(meals),incomplete:day.incomplete===true||notes.length>0||invalidItems>0,
  ...(invalidItems?{invalidItems}:{}),freshness};
}
export const sameFreshness=(a,b)=>!!a&&!!b&&['targetDate','dayRevision','planFingerprint','notesRevision'].every(key=>a[key]===b[key]);
export async function loadConfirmed({readSnapshot,readDay,readPlan},uid,date,signal) {
 try {
  const {day,plan}=readSnapshot?await readSnapshot(uid,date,signal):await Promise.all([readDay(uid,date,signal),readPlan?readPlan(uid,signal):{}]).then(([day,plan])=>({day,plan}));
  return {day:await confirmedSnapshot(day,plan,date),plan:{...plan,catalog:plan.catalog||buildPlanCatalog(plan.planContext||{})}};
 }catch(error){if(error?.message==='invalid_token'||error?.message==='pilot_forbidden')throw error;fail('day_unavailable',503);}
}

export const MODEL_DAY_OMITTED_FIELDS=Object.freeze({
 day:["submissionMarkers","rejectedSubmissions","writerVersion","writerNonce","foodNotes","totalMacros","legacyImportProfileId","freshness","planFingerprint","notesRevision"],
 food:["itemId","originalTextRef"],
 allocation:["version","referenceKey","referenceName","conversion","normSource"],
 note:["commandHash","submissionId","originDraft","writerVersion","writerNonce","createdAt","updatedAt","resolvedAt"],
});
const omit=(value,keys)=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>!keys.includes(key)));
// Model-facing facts exclude writer bookkeeping and duplicate allocation mechanics.
// Quantities, nutrients, full source/provenance, unknowns, dates and activity stay intact.
export function projectDayForModel(day) {
 if(!day||typeof day!=="object")return day;
 const result=omit(day,MODEL_DAY_OMITTED_FIELDS.day);
 if(day.meals)result.meals=Object.fromEntries(Object.entries(day.meals).map(([meal,groups])=>[meal,Object.fromEntries(Object.entries(groups||{}).map(([group,items])=>{
  if(!Array.isArray(items))fail("day_unavailable",503);
  return [group,items.map(item=>{
   if(!item||typeof item!=="object"||Array.isArray(item))fail("day_unavailable",503);
   return {...omit(item,MODEL_DAY_OMITTED_FIELDS.food),...(item.planAllocation?{planAllocation:omit(item.planAllocation,MODEL_DAY_OMITTED_FIELDS.allocation)}:{})};
  })];
 }))]));
 if(day.notes)result.notes=day.notes.map(note=>omit(note,MODEL_DAY_OMITTED_FIELDS.note));
 return result;
}
// Model transport only. Column paths remove repeated nested property names.
// Arrays, empty objects, null and missing values remain distinct on roundtrip.
const leafEntries=(value,path=[],output=[])=>{
 if(value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).length){
  for(const [key,child] of Object.entries(value))leafEntries(child,[...path,key],output);
 }else output.push([path,value]);
 return output;
};
function encodeRows(entries) {
 const allFields=[...new Set(entries.flatMap(({values})=>[...values.keys()]))].sort();
 const foodDefaults=[];
 const fields=allFields.filter(key=>{
  if(entries.length<2||!entries.every(({values})=>values.has(key)))return true;
  const value=entries[0].values.get(key),encoded=JSON.stringify(value);
  if(!entries.every(({values})=>JSON.stringify(values.get(key))===encoded))return true;
  foodDefaults.push([JSON.parse(key),value]);return false;
 });
 const rows=entries.map(({prefix,values})=>{
  const absent=[];const cells=fields.map((key,i)=>{if(!values.has(key)){absent.push(i);return null;}return values.get(key);});
  return [...prefix,...cells,...(absent.length?[{absent}]:[])];
 });
 const foodDictionaries={};
 for(let i=0;i<fields.length;i++){
  const dictionary=[],indices=new Map(),values=rows.map((row,n)=>row[i+entries[n].prefix.length]);
  const codes=values.map(value=>{const key=JSON.stringify(value);if(!indices.has(key)){indices.set(key,dictionary.length);dictionary.push(value);}return indices.get(key);});
  // Encode only when this exact column is smaller, including dictionary metadata.
  if(Buffer.byteLength(JSON.stringify(dictionary))+Buffer.byteLength(JSON.stringify(codes))+16<Buffer.byteLength(JSON.stringify(values))){
   foodDictionaries[i]=dictionary;rows.forEach((row,n)=>{row[i+entries[n].prefix.length]=codes[n];});
  }
 }
 return {columns:fields.map(JSON.parse),rows,defaults:foodDefaults,dictionaries:foodDictionaries};
}

export function modelDay(rawDay) {
 const day=projectDayForModel(rawDay);
 if(!day||!day.meals)return day;
 const {meals,notes=[],...rest}=day,entries=[],groups={};
 for(const [meal,value] of Object.entries(meals)){
  if(!value||typeof value!=="object"||Array.isArray(value))fail("day_unavailable",503);
  groups[meal]=Object.keys(value);
  for(const [group,items] of Object.entries(value))for(const item of items){
   entries.push({prefix:[meal,group],values:new Map(leafEntries(item).map(([path,value])=>[JSON.stringify(path),value]))});
  }
 }
 const foods=encodeRows(entries),noteTable=encodeRows(notes.map(note=>({prefix:[],values:new Map(leafEntries(note).map(([path,value])=>[JSON.stringify(path),value]))})));
 return {...rest,foodColumns:['meal','group',...foods.columns],foods:foods.rows,mealGroups:groups,
  ...(foods.defaults.length?{foodDefaults:foods.defaults}:{}),...(Object.keys(foods.dictionaries).length?{foodDictionaries:foods.dictionaries}:{}),
  notes:noteTable.rows,noteColumns:noteTable.columns,...(noteTable.defaults.length?{noteDefaults:noteTable.defaults}:{}),...(Object.keys(noteTable.dictionaries).length?{noteDictionaries:noteTable.dictionaries}:{})};
}
function decodeRow(row,fields,defaults,dictionaries,offset=0) {
 const absent=new Set(row[fields.length+offset]?.absent||[]),item={};
 const set=(path,value)=>{
  let target=item;
  path.forEach((key,j)=>{
   if(j===path.length-1)Object.defineProperty(target,key,{value:structuredClone(value),enumerable:true,writable:true,configurable:true});
   else {if(!Object.hasOwn(target,key))Object.defineProperty(target,key,{value:{},enumerable:true,writable:true,configurable:true});target=target[key];}
  });
 };
 for(const [path,value] of defaults||[])set(path,value);
 fields.forEach((path,i)=>{if(!absent.has(i))set(path,dictionaries?.[i]?dictionaries[i][row[i+offset]]:row[i+offset]);});
 return item;
}
export const decodeModelNotes=day=>day.notes.map(row=>decodeRow(row,day.noteColumns,day.noteDefaults,day.noteDictionaries));
export function decodeModelMeals(day) {
 const fields=day.foodColumns.slice(2),meals=Object.fromEntries(Object.entries(day.mealGroups).map(([meal,groups])=>[meal,Object.fromEntries(groups.map(group=>[group,[]]))]));
 for(const row of day.foods)meals[row[0]][row[1]].push(decodeRow(row,fields,day.foodDefaults,day.foodDictionaries,2));
 return meals;
}
