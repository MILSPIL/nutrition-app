import { buildPlanCatalog } from './planCatalog';
import { assignPlanItems, dailyPlanProgress, allocationPercent, persistedPlanItem } from './planAllocation';
import { itemMacros, withQuantity } from './mealItems';
import { applyDayCommand } from './mealCommands';
const catalog=()=>buildPlanCatalog({profile:{}});
const food=(name,value=200,unit='g')=>({itemId:name,name,quantity:{value,unit},nutritionBasis:{value:100,unit},nutrients:{p:1,f:1,c:10,cal:53},source:{kind:'estimate'},estimated:true});
const matched=(item,c,name,state='as_sold')=>({...item,planMatch:{referenceId:c.references.find(r=>r.name===name).refId,consumedState:state,certainty:'matched'}});
test('L02/L03: фрукти рахуються за день незалежно від прийому',()=>{
 const c=catalog();const [apple]=assignPlanItems([matched(food('Яблуко'),c,'фрукти та ягоди')],c,{});
 expect(apple.planAllocation.letter).toBe('з');expect(apple.portion).toBe(50);
 const [banana]=assignPlanItems([matched(food('Банан',120),c,'банани/виноград/хурма')],c,{1:{з:[apple]}});
 expect(dailyPlanProgress({1:{з:[apple]},3:{з:[banana]}}).letters.з.percent).toBe(100);
 expect(itemMacros(apple).cal).toBe(106);
});
test('L03: маса після приготування та незмінна пропорція мл',()=>{
 const c=catalog();const [rice]=assignPlanItems([matched(food('Рис',170),c,'рис нешліфований','cooked')],c,{});
 expect(rice.portion).toBeCloseTo(100,8);
 let milk=matched(food('Кефір',200,'ml'),c,'кефір 1%');milk.planChoice={letter:'б',assignment:'manual',massGrams:206};
 const [allocated]=assignPlanItems([milk],c,{});
 expect(allocationPercent(withQuantity(allocated,300))).toBeCloseTo(309/270*100,8);
 const changed=withQuantity(allocated,300,'g');expect(allocationPercent(changed)).toBeNull();
});
test('L04: невідома літера не блокує валідну їжу; ручний вибір незмінний',()=>{
 const c=catalog();const [unknown]=assignPlanItems([food('Невідоме')],c,{});
 expect(unknown.planAllocation.status).toBe('unallocated');
 const [manual]=assignPlanItems([{...food('Невідоме'),planChoice:{letter:'з',assignment:'manual'}}],c,{});
 expect(manual.planAllocation.status).toBe('unresolved');expect(manual.planAllocation.letter).toBe('з');
});
test('L05: один пакет додає різні групи і повтор не множить рядки',()=>{
 const c=catalog(),items=assignPlanItems([matched(food('Яблуко'),c,'фрукти та ягоди'),food('Невідоме')],c,{}).map(persistedPlanItem);
 const command={type:'appendAllocated',submissionId:'s1',meal:1,items};
 const {day}=applyDayCommand({},command,'hash');expect(day.meals[1].з).toHaveLength(1);expect(day.meals[1].voice).toHaveLength(1);
 expect(applyDayCommand(day,command,'hash').duplicate).toBe(true);
});
test('L06: невідома норма дає неповний підсумок; старий voice не нуль',()=>{
 const progress=dailyPlanProgress({1:{з:[{...food('старий'),portion:50}],voice:[food('невідомий')]},2:{з:[food('без норми')]}});
 expect(progress.letters.з.percent).toBe(50);expect(progress.letters.з.unknown).toBe(1);expect(progress.unallocatedCount).toBe(1);
});
