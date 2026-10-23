import React from 'react';
import DecimalInput from './DecimalInput';
import {PRODUCTS_DB} from '../data/products';
import {percentText} from '../services/planAllocation';
import {parseDecimal} from '../services/mealItems';
export default function PlanAllocationFields({item,index,catalog,progress,after,disabled,onChange,onSearch}) {
 const a=item.planAllocation,choice=item.planChoice||{},letter=a.letter;
 const normRefs=catalog.references.filter(r=>r.letter===letter);
 const patch=extra=>onChange({...choice,...extra});
 const mass=choice.mass,grams=mass&&mass.baseQuantity.unit===item.quantity.unit?mass.baseMassGrams*item.quantity.value/mass.baseQuantity.value:null;
 return <div className="voice-plan">
  <p className="voice-plan-badge">{letter?`${letter.toUpperCase()} · ${PRODUCTS_DB[letter].name}`:'Без літери'} · {a.status==='allocated'?`${percentText(item.portion)} норми`:'норму не визначено'}{a.assignment==='auto'?' · Автоматично':''}</p>
  <details><summary>Змінити літеру або норму</summary>
   <label>Літера програми (необов’язково)<select aria-label={`Літера продукту ${index+1}`} disabled={disabled} value={choice.assignment==='manual'?choice.letter||'':'auto'} onChange={e=>onChange(e.target.value==='auto'?{}:{...choice,assignment:'manual',letter:e.target.value,referenceKey:undefined})}>
    <option value="auto">Автоматично</option><option value="">Без літери</option>{Object.entries(PRODUCTS_DB).map(([key,data])=><option key={key} value={key}>{key.toUpperCase()} · {data.name}</option>)}
   </select></label>
   {letter&&letter!=='в'&&<>
    <label>Відповідник норми<select aria-label={`Відповідник продукту ${index+1}`} disabled={disabled} value={choice.referenceKey??(a.status==='allocated'?a.referenceKey:'')} onChange={e=>{onSearch();patch({letter,assignment:'manual',referenceKey:e.target.value});}}>
     <option value="">Норму не обрано</option>{normRefs.map(r=><option key={r.referenceKey} value={r.referenceKey}>{r.name}{r.norm?` · ${r.norm} г`:''}</option>)}
    </select></label>
    <label>Стан продукту<select aria-label={`Стан продукту ${index+1}`} disabled={disabled} value={choice.consumedState||item.planMatch?.consumedState||'unknown'} onChange={e=>patch({consumedState:e.target.value})}>
     <option value="unknown">Не знаю</option><option value="raw">Сирий</option><option value="cooked">Приготований</option><option value="as_sold">Як у пакуванні</option>
    </select></label>
    {item.quantity.unit!=='g'&&<label>Підтверджена маса цієї кількості, г<DecimalInput aria-label={`Маса продукту ${index+1}`} disabled={disabled} inputMode="decimal" value={grams??''} onChange={e=>patch({mass:{baseQuantity:{...item.quantity},baseMassGrams:parseDecimal(e.target.value)}})}/></label>}
   </>}
   {a.status==='allocated'&&<p>Основа норми: {a.basis.value} {a.basis.unit==='kcal'?'ккал':'г'} · {a.referenceName}</p>}
   {letter&&<p>За день: {percentText(progress.letters[letter].percent)} → {percentText(after.letters[letter].percent)}{after.letters[letter].unknown>0?' · частину норми не визначено':''}</p>}
  </details>
  {a.status!=='allocated'&&<p className="voice-plan-note">Калорії та БЖВ можна додати. Для частки програми бракує {letter?'відповідника, стану або маси':'певного відповідника'}. Уточнення необов’язкове.</p>}
 </div>;
}
