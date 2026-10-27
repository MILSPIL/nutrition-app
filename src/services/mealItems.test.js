import { itemMacros,itemProblems,withQuantity,catalogItem,normalizeAnalysis,mergePhotoItem,quantityText } from './mealItems';
import { applyDayCommand,selectDay,stableJson } from './mealCommands';
const item=(id='one')=>({itemId:id,name:'Тестовий кефір',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:3.2,f:3.4,c:4.2,cal:60},source:{kind:'label'},estimated:false});
const add=(id='one')=>({type:'append',submissionId:id,meal:1,items:[item(id)],updatedAt:'2026-10-20T12:00:00Z'});
test('етикетка A: 200 г і редагування 250 г не шукають каталог',()=>{
 expect(itemMacros(item())).toEqual({p:6.4,f:6.8,c:8.4,cal:120});
 expect(itemMacros(withQuantity(item(),250))).toEqual({p:8,f:8.5,c:10.5,cal:150});
});
test.each(['p','f','c','cal'])('невідоме %s не стає нулем',key=>{const i=item();i.nutrients[key]=null;expect(itemProblems(i).length).toBeGreaterThan(0);expect(()=>itemMacros(i)).toThrow();});
test('нуль на етикетці є справжнім значенням',()=>{const i=item();i.nutrients={p:0,f:0,c:0,cal:0};expect(itemProblems(i)).toEqual([]);expect(itemMacros(i).cal).toBe(0);});
test('мл не дорівнює г без густини',()=>{const i=item();i.quantity.unit='ml';expect(()=>itemMacros(i)).toThrow();i.density=1.1;expect(itemMacros(i).cal).toBeCloseTo(132);});
test.each(['ml','portion','package'])('однакові одиниці %s зберігають пропорцію',unit=>{const i=item();i.quantity={value:2,unit};i.nutritionBasis={value:1,unit};expect(itemMacros(i).cal).toBe(120);expect(quantityText(i)).not.toContain(' г');});
test('ручний продукт зберігає основу та raw/cooked',()=>{const i=catalogItem({name:'Рис',p:7,f:1,c:70,cal:320,coef:3},50,100,'rice');expect(i.rawCookedCoef).toBe(3);expect(itemMacros(i).cal).toBe(160);});
test('legacy calories і готова вага переживають редагування',()=>{const i=withQuantity({name:'Рис',weight:50,cookedWeight:150,calories:160,p:7,f:1,c:70},100);expect(i.cookedWeight).toBe(300);expect(itemMacros(i).cal).toBe(320);});
test('частковий розбір не губить продукт без кількості',()=>{const i=item();i.quantity.value=null;const result=normalizeAnalysis({items:[i],unparsed:['ще щось']},()=> 'fixed');expect(result.items).toHaveLength(1);expect(itemProblems(result.items[0]).length).toBeGreaterThan(0);expect(result.unparsed).toEqual(['ще щось']);});
test('фото замінює лише обраний рядок і не вагу спожитого',()=>{const i=item();const photographed={...item(),quantity:{value:900,unit:'g'},nutrients:{p:2.9,f:2.5,c:4,cal:53}};const updated=mergePhotoItem(i,{items:[photographed],unparsed:[]});expect(updated.quantity.value).toBe(200);expect(updated.itemId).toBe(i.itemId);expect(itemMacros(updated).cal).toBe(106);});
test('несумісну етикетку фото треба уточнити',()=>{const i=item();const photo={...item(),nutritionBasis:{value:100,unit:'ml'}};expect(()=>mergePhotoItem(i,{items:[photo],unparsed:[]})).toThrow();});
test('той самий submission не дублює після повтору',()=>{const c=add();const first=applyDayCommand({},c,'hash');const retry=applyDayCommand(first.day,c,'hash');expect(retry.duplicate).toBe(true);expect(retry.day.meals[1].voice).toHaveLength(1);expect(retry.day.revision).toBe(1);});
test('той самий ID з іншими даними відхиляється',()=>{const first=applyDayCommand({},add(),'hash').day;expect(()=>applyDayCommand(first,add(),'other')).toThrow('submission_conflict');});
test('два незалежні записи з однаковою їжею дозволені',()=>{const first=applyDayCommand({},add(),'one').day;const next=applyDayCommand(first,add('two'),'two').day;expect(next.meals[1].voice).toHaveLength(2);expect(next.totalMacros.cal).toBe(240);});
test('старий autosave snapshot не стирає новий запис',()=>{const day=applyDayCommand({},add(),'one').day;expect(()=>applyDayCommand(day,{type:'replace',submissionId:'old',meals:{},expectedRevision:0},'h')).toThrow('revision_conflict');});
test('metadata/autosave зберігає markers і revision',()=>{const day=applyDayCommand({},add(),'one').day;const next=applyDayCommand(day,{type:'metadata',submissionId:'meta',metadata:{activity:'Ходьба'},updatedAt:'today'},'meta').day;expect(next.submissionMarkers).toEqual({one:'one',meta:'meta'});expect(next.meals).toEqual(day.meals);expect(next.revision).toBe(2);});
test('порожній день не підставляє недатовані або вчорашні meals',()=>{const root={meals:{1:{a:[item()]}}};expect(selectDay(root,null,'2026-10-21').meals[1]).toEqual({});expect(selectDay(root,null,'2026-10-21').legacy).toEqual(root.meals);expect(selectDay({...root,mealsDateKey:'2026-10-20'},null,'2026-10-21').legacy).toBeNull();});
test('хеш payload незалежний від порядку ключів',()=>expect(stableJson({b:1,a:2})).toBe(stableJson({a:2,b:1})));

test('manual raw/cooked та portion залишаються сумісними після редагування',()=>{const i=catalogItem({name:'Рис',p:7,f:1,c:70,cal:320,coef:3},50,100,'rice');expect(quantityText(i)).toBe('150 г (50 г сир.)');const next=withQuantity(i,100);expect(next.portion).toBe(200);expect(quantityText(next)).toBe('300 г (100 г сир.)');});
