import {TextEncoder} from 'util';
global.TextEncoder=TextEncoder;
import {webcrypto} from 'crypto';
import { buildPlanCatalog,planFingerprint,validatedPlanMatch } from './planCatalog';
test('L09: каталог не містить профільних даних, зберігає окремі норми сімей',()=>{
 const c=buildPlanCatalog({profile:{name:'PRIVATE',uid:'SECRET',portions:{'кефір 1%':300}},globalCustomProducts:{з:[{name:'Свій фрукт',raw:500,addedById:'PRIVATE'}]}});
 expect(JSON.stringify(c.apiCatalog)).not.toMatch(/PRIVATE|SECRET|300|500/);
 const b=c.references.find(r=>r.name==='кефір 1%'),j=c.references.find(r=>r.name==='кефір 1% (ж)');
 expect(b.family).toBe(j.family);expect(b.norm).toBe(300);expect(j.norm).toBe(365);
});
test('L09: надмірний каталог переходить на v1 цілком',()=>{
 const c=buildPlanCatalog({profile:{customProducts:{з:Array.from({length:201},(_,i)=>({name:`Фрукт ${i}`,raw:500}))}}});
 expect(c.overLimit).toBe(true);expect(c.apiCatalog).toBeNull();
});

test.each(['   ',42])('L09: некоректна назва %s вимикає v2 замість зриву їжі',name=>{
 const c=buildPlanCatalog({globalCustomProducts:{з:[{name,raw:500}]}});expect(c.overLimit).toBe(true);expect(c.apiCatalog).toBeNull();
 expect(validatedPlanMatch({referenceId:'fruits:fruit',certainty:'matched',consumedState:'as_sold'},c)).toBeNull();
});
test('L09: дві однакові назви різного походження не стають впевненим match',()=>{
 const c=buildPlanCatalog({profile:{customProducts:{з:[{name:'Свій фрукт',raw:500}]}},globalCustomProducts:{з:[{name:'Свій фрукт',raw:600}]}});
 const refs=c.references.filter(r=>r.name==='Свій фрукт');expect(new Set(refs.map(r=>r.refId)).size).toBe(2);
 for(const ref of refs)expect(validatedPlanMatch({referenceId:ref.refId,certainty:'matched',consumedState:'as_sold'},c)).toBeNull();
});
test('L09: snapshot не змінюється після мутації вихідного профілю',async()=>{
 Object.defineProperty(global,'crypto',{configurable:true,value:webcrypto});
 const context={profile:{portions:{'кефір 1%':300}},productOverrides:{'молоко 1%':{raw:350}}};
 const snapshot=buildPlanCatalog(context),old=await planFingerprint(snapshot);
 context.profile.portions['кефір 1%']=400;context.productOverrides['молоко 1%'].raw=450;
 expect(await planFingerprint(snapshot)).toBe(old);expect(await planFingerprint(context)).not.toBe(old);
});
