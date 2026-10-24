import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import TrainerLauncher from './TrainerLauncher';
global.IS_REACT_ACT_ENVIRONMENT=true;
let host,root;
beforeEach(()=>{host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);document.body.style.overflow='';});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();document.body.style.overflow='';});
test('launcher opens one dialog and stays mounted while hidden for focus restoration',async()=>{
 const onOpen=jest.fn();await act(async()=>root.render(<TrainerLauncher onOpen={onOpen}/>));
 const button=host.querySelector('button');expect(button.hidden).toBe(false);expect(button.getAttribute('aria-haspopup')).toBe('dialog');
 await act(async()=>Simulate.click(button));expect(onOpen).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<TrainerLauncher onOpen={onOpen} hidden/>));expect(host.querySelector('button')).toBe(button);expect(button.hidden).toBe(true);
});
test('launcher hides behind independently controlled modal and returns after close',async()=>{
 await act(async()=>root.render(<TrainerLauncher onOpen={()=>{}}/>));
 await act(async()=>{document.body.style.overflow='hidden';await Promise.resolve();});expect(host.querySelector('button').hidden).toBe(true);
 await act(async()=>{document.body.style.overflow='';await Promise.resolve();});expect(host.querySelector('button').hidden).toBe(false);
});

test('launcher remains hidden until a closing modal surface unmounts',async()=>{
 await act(async()=>root.render(<TrainerLauncher onOpen={()=>{}}/>));
 const modal=document.createElement('div');modal.setAttribute('data-modal-surface','true');
 await act(async()=>{document.body.appendChild(modal);await Promise.resolve();});expect(host.querySelector('button').hidden).toBe(true);
 await act(async()=>{modal.remove();await Promise.resolve();});expect(host.querySelector('button').hidden).toBe(false);
});
