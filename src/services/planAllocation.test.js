import {TextEncoder} from 'util';
global.TextEncoder=TextEncoder;
import { buildPlanCatalog } from './planCatalog';
import { assignPlanItems, dailyPlanProgress, allocationPercent, persistedPlanItem, percentText } from './planAllocation';
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

test.each([
 ['кефір 1%',200,'as_sold','б',74.07407407407408],
 ['куряче філе',116.09,'cooked','д',100],
 ['рис нешліфований',50,'raw','а',100],
 ['будь-що',20,'as_sold','в',10.6/575*100],
])('L03: %s має окрему норму без зміни ккал', (name,q,state,letter,percent)=>{
 const c=catalog();const input=matched(food(name,q),c,name,state);const [item]=assignPlanItems([input],c,{});
 expect(item.planAllocation.letter).toBe(letter);expect(item.portion).toBeCloseTo(percent,8);expect(itemMacros(item)).toEqual(itemMacros(input));
});
test('L02: ручна літера резервується першою, решта переходить у вільну сімейну літеру',()=>{
 const c=catalog();const auto=matched(food('Кефір'),c,'кефір 1%');
 const manual={...matched(food('Кефір manual',270),c,'кефір 1%'),planChoice:{letter:'б',assignment:'manual'}};
 const [a,m]=assignPlanItems([auto,manual],c,{});expect(a.planAllocation.letter).toBe('ж');expect(a.portion).toBeCloseTo(54.7945205479,8);expect(m.portion).toBe(100);
});
test('L02: цілі порції не діляться, неповна категорія не вигадує залишок',()=>{
 const c=catalog(),input=matched(food('Кефір',400),c,'кефір 1%');
 expect(assignPlanItems([input],c,{1:{б:[{...food('старий'),portion:99}]}})[0].planAllocation.letter).toBe('б');
 expect(assignPlanItems([input],c,{1:{б:[food('невідома норма')]}})[0].planAllocation.letter).toBe('ж');
});
test.each([0,-1,null,NaN])('L03: явно невалідна норма %s не бере default', norm=>{
 const c=buildPlanCatalog({profile:{portions:{'фрукти та ягоди':norm}}});
 expect(assignPlanItems([matched(food('Яблуко'),c,'фрукти та ягоди')],c,{})[0].planAllocation.status).toBe('unresolved');
});
test('L03: custom 500 г має власну норму і не зливається зі стандартом',()=>{
 const c=buildPlanCatalog({profile:{customProducts:{з:[{name:'Мій фрукт',raw:500}]}}});
 const [item]=assignPlanItems([matched(food('Мій фрукт'),c,'Мій фрукт')],c,{});expect(item.portion).toBe(40);
});
test('L03: мл без густини, упаковка без маси й рис без стану не вигадують відсоток',()=>{
 const c=catalog();for(const input of [matched(food('Кефір',200,'ml'),c,'кефір 1%'),matched(food('Кефір',1,'package'),c,'кефір 1%'),matched(food('Рис'),c,'рис нешліфований','unknown')]) {
  expect(assignPlanItems([input],c,{})[0].planAllocation.status).toBe('unresolved');
 }
});
test('L03: профільні норми не переписують збережену історію; пошкоджений кеш неповний',()=>{
 const c=catalog(),[item]=assignPlanItems([matched(food('Яблуко'),c,'фрукти та ягоди')],c,{});
 buildPlanCatalog({profile:{portions:{'фрукти та ягоди':800}}});expect(allocationPercent(item)).toBe(50);
 expect(dailyPlanProgress({1:{з:[{...item,portion:99}]}}).letters.з).toMatchObject({percent:0,unknown:1});
});
test('L04: ручна інша сім’я лишається без норми до вибору відповідника',()=>{
 const c=catalog(),input={...matched(food('Яблуко'),c,'фрукти та ягоди'),planChoice:{letter:'б',assignment:'manual'}};
 expect(assignPlanItems([input],c,{})[0].planAllocation.status).toBe('unresolved');
 input.planChoice.referenceKey=c.references.find(r=>r.name==='кефір 1%').referenceKey;
 expect(assignPlanItems([input],c,{})[0].portion).toBeCloseTo(200/270*100,8);
});
test('L06: В може перевищувати 100%, фрукти не обирають free:fruit автоматично',()=>{
 const c=catalog(),input={...food('Шоколад',100),nutrients:{p:1,f:1,c:1,cal:600},planMatch:{referenceId:'free:anything',certainty:'matched',consumedState:'as_sold'}};
 const [item]=assignPlanItems([input],c,{});expect(item.portion).toBeCloseTo(104.3478260869,8);
 expect(assignPlanItems([{...food('Яблуко'),planMatch:{...input.planMatch,referenceId:'free:fruit'}}],c,{})[0].planAllocation.status).toBe('unallocated');
});

test('L04: ручне Без літери не замінюється автоматичним відповідником',()=>{
 const c=catalog(),input={...matched(food('Яблуко'),c,'фрукти та ягоди'),planChoice:{assignment:'manual',letter:''}};
 const [item]=assignPlanItems([input],c,{});expect(item.planAllocation).toEqual({version:1,status:'unallocated',assignment:'manual'});expect(item.portion).toBeUndefined();
});
test('L02: коли всі категорії неповні, обирається перша без оцінки залишку',()=>{
 const c=catalog(),input=matched(food('Кефір'),c,'кефір 1%');
 const [item]=assignPlanItems([input],c,{1:{б:[{...food('known'),portion:99},food('unknown1')],ж:[food('unknown2')]}});
 expect(item.planAllocation.letter).toBe('б');
});
test('L03: малі перевищення та недобір не виглядають рівно як 100%',()=>{
 expect(percentText(100.01)).toBe('>100%');expect(percentText(99.99)).toBe('<100%');expect(percentText(100)).toBe('100%');
});
