import {applyDayCommand} from './mealCommands';
const food={itemId:'test',name:'Їжа',quantity:{value:100,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:1,f:1,c:1,cal:17},source:{kind:'estimate'}};
const command=allocation=>({type:'appendAllocated',meal:1,submissionId:'id',items:[{...food,planAllocation:allocation}]});
test.each([
 {version:1,status:'unallocated',assignment:'auto'},
 {version:1,status:'unresolved',letter:'з',assignment:'manual'},
])('L05: допустима форма %j зберігається без кешу portion',a=>{
 const {day}=applyDayCommand({},command(a),'hash');expect(day.meals[1][a.letter||'voice']).toHaveLength(1);
});
test.each([
 {},{version:1,status:'unallocated',assignment:'auto',letter:'з'},
 {version:1,status:'unresolved',assignment:'auto'},
 {version:1,status:'unresolved',assignment:'auto',letter:'з',basis:{value:400}},
 {version:1,status:'allocated',letter:'з',assignment:'auto'},
])('L05: невалідний allocation %j відхиляє пакет до зміни дня',a=>{
 const day={meals:{1:{}},revision:2};expect(()=>applyDayCommand(day,command(a),'hash')).toThrow('invalid_allocation');expect(day).toEqual({meals:{1:{}},revision:2});
});
test('L05: дублі ID та будь-який невалідний рядок не дають часткового запису',()=>{
 const c=command({version:1,status:'unallocated',assignment:'auto'});c.items.push(c.items[0]);expect(()=>applyDayCommand({},c,'hash')).toThrow('duplicate_item');
});
