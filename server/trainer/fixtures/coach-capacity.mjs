// Synthetic persisted shapes only. Shared by unit and pinned native runtime probes.
import { buildPlanCatalog } from '../../../src/services/planCatalog.js';
import { assignPlanItems, persistedPlanItem } from '../../../src/services/planAllocation.js';
export function coachCapacityFixture(targetDate='2026-03-30') {
 const plan={catalog:buildPlanCatalog()};
 const item=i=>{
  const reference=plan.catalog.references[i%plan.catalog.references.length];
  const raw={itemId:'synthetic-item-'+String(i).padStart(4,'0'),name:'Синтетичний продукт '+i,preparation:reference.basisState,quantity:{value:150+i,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:i/10,f:i/20,c:i/5,cal:60+i},
   source:{kind:'database',label:'Синтетичне джерело',recordId:'synthetic:record-'+i,dataset:'USDA synthetic fixture',version:1,url:'https://example.test/food/'+i,assumptions:['Синтетичне припущення міри'],portionOrigin:{kind:'estimate',assumption:'Приблизна порція180г, не зважена'}},
   estimated:true,nutritionStatus:'complete',clarification:'',planMatch:{referenceId:reference.refId,consumedState:reference.basisState==='raw'?'raw':'as_sold',certainty:'matched'}};
  return persistedPlanItem(assignPlanItems([raw],plan.catalog,{})[0]);
 };
 const meals=Object.fromEntries([1,2,3,4].map(m=>[m,Object.fromEntries(Array.from({length:6},(_,i)=>item(m*10+i)).map(x=>[x.planAllocation.letter||'voice',[]]))]));
 for(let m=1;m<=4;m++)for(let i=0;i<6;i++){const x=item(m*10+i);meals[m][x.planAllocation.letter||'voice'].push(x);}
 const notes=Array.from({length:4},(_,i)=>({noteId:'synthetic-note-'+i,itemId:'synthetic-unknown-'+i,state:'active',name:'Синтетична невідома страва '+i,targetDate,meal:i+1,quantity:{value:null,unit:'unknown'},nutritionBasis:{value:100,unit:'g'},knownNutrients:{cal:60,p:null,f:2,c:3},provenance:{kind:'label',label:'Синтетична часткова етикетка',portionOrigin:{kind:'estimate',assumption:'Вага невідома'}},originalText:'З’їв невідому синтетичну страву',originDraft:'synthetic-origin-0001',submissionId:'synthetic-submission-01',commandHash:'f'.repeat(64),createdAt:'2026-03-30T09:00:00Z'}));

 const day={revision:1,meals,notes,activity:{steps:6500},otherActivity:'Synthetic gym 45 minutes; pool history 50 minutes'};
 const history=Array.from({length:12},(_,i)=>[{id:'u-'+i,role:'user',content:String(i).padStart(2,'0')+'u'.repeat(248)},{id:'a-'+i,role:'assistant',content:String(i).padStart(2,'0')+'a'.repeat(248)}]).flat();
 return {plan,day,meals,notes,history,context:'x'.repeat(8000)};
}
