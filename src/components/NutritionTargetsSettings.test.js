import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import NutritionTargetsSettings from './NutritionTargetsSettings';
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,host;
const input=label=>host.querySelector(`[aria-label="${label}"]`);
const submit=async()=>act(async()=>Simulate.submit(host.querySelector('form')));
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
test('explicit save sends only entered personal targets and confirms after server acknowledgment',async()=>{
 const save=jest.fn(async()=>{});
 await act(async()=>root.render(<NutritionTargetsSettings profile={{}} onSave={save} onBack={()=>{}}/>));
 expect(input('Калорії, ккал').value).toBe('');
 await act(async()=>Simulate.change(input('Білки, г'),{target:{value:'95,5'}}));
 await submit();expect(save).toHaveBeenCalledWith({version:1,p:95.5});
 expect(host.querySelector('[role="status"]').textContent).toContain('збережено');
});
test('failed save retains fields and does not claim success',async()=>{
 await act(async()=>root.render(<NutritionTargetsSettings profile={{nutritionTargets:{version:1,cal:1800}}} onSave={async()=>{throw Error('offline');}} onBack={()=>{}}/>));
 await submit();expect(host.querySelector('[role="alert"]').textContent).toContain('Не вдалося підтвердити');
 expect(host.querySelector('[role="status"]')).toBeNull();expect(input('Калорії, ккал').value).toBe('1800');
});
test('invalid input stays local and account remount clears previous context',async()=>{
 const save=jest.fn(),form=(key,profile)=><NutritionTargetsSettings key={key} profile={profile} onSave={save} onBack={()=>{}}/>;
 await act(async()=>root.render(form('first',{nutritionTargets:{version:1,cal:2305}})));
 await act(async()=>Simulate.change(input('Білки, г'),{target:{value:'-5'}}));
 await submit();expect(host.querySelector('[role="alert"]').textContent).toContain('додатні числа');expect(save).not.toHaveBeenCalled();
 await act(async()=>root.render(form('second',{})));expect(input('Калорії, ккал').value).toBe('');expect(host.querySelector('[role="alert"]')).toBeNull();
});
