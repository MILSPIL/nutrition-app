import { buildPlanCatalog } from './planCatalog';
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
