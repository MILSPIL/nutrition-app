import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import MealSection from './MealSection';
const food=(id,portion)=>({name:id,itemId:id,weight:100,p:1,f:1,c:1,calories:17,...(portion!=null?{portion}:{})});
test('L06: однакова літера має денний підсумок, їжа лише у власному прийомі',()=>{
 const meals={1:{а:[food('Ранковий',50)]},2:{а:[food('Денний',25)]},3:{},4:{}};
 const first=renderToStaticMarkup(<MealSection meals={meals} selectedMeal={1}/>),second=renderToStaticMarkup(<MealSection meals={meals} selectedMeal={2}/>);
 for(const html of [first,second])expect(html).toContain('75% за день');
 expect(first).not.toContain('Денний');expect(second).not.toContain('Ранковий');
});
test('L06: старий voice і невідома норма не видаються за виконану норму',()=>{
 const html=renderToStaticMarkup(<MealSection meals={{1:{voice:[food('Голос')],а:[food('Без норми')]}}} selectedMeal={1}/>);
 expect(html).toContain('Без визначеної норми');expect(html).toContain('неповно');
});
