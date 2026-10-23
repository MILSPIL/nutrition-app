import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import DecimalInput from './DecimalInput';
import PlanAllocationFields from './PlanAllocationFields';
import ProductModal from './ProductModal';
import {parseDecimal} from '../services/mealItems';
jest.mock('./AnimatedModal',()=>({children})=>children);
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,container;
beforeEach(()=>{container=document.createElement('div');root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());});
test('review: частково введена кома не перетворюється на NaN',async()=>{
 function Probe(){const [value,setValue]=useState(1);return <DecimalInput value={value} onChange={e=>setValue(parseDecimal(e.target.value))}/>;}
 await act(async()=>root.render(<Probe/>));await act(async()=>Simulate.change(container.querySelector('input'),{target:{value:','}}));
 expect(container.querySelector('input').value).toBe(',');
});
const props=()=>({item:{quantity:{value:null,unit:'ml'},planAllocation:{letter:'б',status:'unresolved',assignment:'manual'},planChoice:{assignment:'manual',letter:'б',mass:{baseQuantity:{value:200,unit:'ml'},baseMassGrams:206},consumedState:'as_sold'}},index:0,catalog:{references:[]},progress:{letters:{б:{percent:0}}},after:{letters:{б:{percent:0}}},onChange:jest.fn(),onSearch:jest.fn()});
test('review: маса недоступна, доки немає додатної кількості',async()=>{
 const p=props();await act(async()=>root.render(<PlanAllocationFields {...p}/>));expect(container.querySelector('input').disabled).toBe(true);
});
test('review: Автоматично зберігає підтверджений стан і пропорцію маси',async()=>{
 const p=props();await act(async()=>root.render(<PlanAllocationFields {...p}/>));await act(async()=>Simulate.change(container.querySelector('[aria-label="Літера продукту 1"]'),{target:{value:'auto'}}));
 expect(p.onChange).toHaveBeenCalledWith({mass:p.item.planChoice.mass,consumedState:'as_sold'});
});
test('review: надлишок норми не виводить хвіст floating point',async()=>{
 await act(async()=>root.render(<ProductModal isOpen currentLetter="з" meals={{1:{з:[{name:'яблуко',weight:410,calories:200,p:0,f:0,c:0,portion:102.49999999999999}]}}} getAllProducts={()=>[]}/>));
 expect(container.textContent).toContain('(+2.5% понад норму)');expect(container.textContent).not.toContain('99999');
});
