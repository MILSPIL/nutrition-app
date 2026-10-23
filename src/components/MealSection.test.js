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
 expect(html).toContain('Без літери');expect(html).toContain('Норму не визначено');expect(html).toContain('неповно');
});

test('L06: невизначена норма позначена в рядку, безлітерні продукти рахуються за весь день',()=>{
 const meals={1:{з:[food('Відомий',40),food('Невідома норма')]},2:{voice:[food('Без літери в іншому прийомі')]},3:{},4:{}};
 const first=renderToStaticMarkup(<MealSection meals={meals} selectedMeal={1}/>);
 expect(first).toContain('40% за день · неповно');
 expect(first).toContain('Без літери за день: 1');
 expect(first.match(/Норму не визначено/g)).toHaveLength(1);
 expect(first).not.toContain('Без літери в іншому прийомі');
 const second=renderToStaticMarkup(<MealSection meals={meals} selectedMeal={2}/>);
 expect(second).toContain('Без літери за день: 1');
 expect(second).toContain('Норму не визначено');
});
