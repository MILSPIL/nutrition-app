import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import ClientApp from './ClientApp';
import {useMealDay} from '../services/useMealDay';
import {signOut} from 'firebase/auth';
import {getDoc} from 'firebase/firestore';
jest.mock('../firebase',()=>({auth:{},db:{}}));
jest.mock('firebase/auth',()=>({onAuthStateChanged:(_auth,fn)=>{fn({uid:'demo-owner'});return ()=>{};},signOut:jest.fn(async()=>{})}));
jest.mock('firebase/firestore',()=>({doc:jest.fn(),getDoc:jest.fn(),onSnapshot:()=>()=>{}}));
jest.mock('../services/useMealDay',()=>({useMealDay:jest.fn(),saveError:e=>e.message}));
jest.mock('../services/mealStore',()=>({loadMealDay:jest.fn(),saveProfileSettings:jest.fn()}));
jest.mock('../services/pilotLedger',()=>({createPilotLedger:()=>({enabled:false,close:async()=>{}})}));
jest.mock('../components/PilotPanel',()=>()=>null);
jest.mock('../components/VoiceInputModal',()=>p=>p.isOpen?<div data-testid="pending-modal">{p.pendingSave?'Перевірка попереднього запису':'Нова чернетка'}</div>:null);
jest.mock('../components',()=>{
 const React=require('react');const Header=jest.requireActual('../components/Header').default;const empty=()=>null;
 return {Header,ToastProvider:({children})=><>{children}</>,toast:{error:jest.fn()},LoginScreen:empty,MealSection:empty,ProductModal:empty,ReportModal:empty,AddCustomProductModal:empty,PortionSettingsModal:empty,DaySelectorModal:empty,AccountSwitchModal:empty,SettingsModal:empty,ActivitySection:empty,RulesSection:empty,LoadingScreen:empty,WelcomeModal:empty,AddTrainerModal:empty,MeasurementsModal:empty,MeasurementReminderModal:empty};
});
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,container,state;
const button=text=>[...container.querySelectorAll('button')].find(n=>(n.getAttribute('aria-label')||n.textContent.trim())===text);
beforeEach(async()=>{
 jest.clearAllMocks();getDoc.mockResolvedValue({exists:()=>true,data:()=>({users:{'demo-owner':{name:'Синтетичний користувач',portions:{}}}})});
 state={day:{meals:{1:{},2:{},3:{},4:{}}},ready:true,busy:false,error:'',hasPending:true,requiresReload:false,retry:jest.fn(async()=>{}),reload:jest.fn()};useMealDay.mockImplementation(()=>state);
 container=document.createElement('div');root=createRoot(container);await act(async()=>root.render(<ClientApp/>));
});
afterEach(async()=>{await act(async()=>root.unmount());});
test('L05: unknown без error лишає повтор і дату заблокованою',async()=>{
 expect(container.querySelector('[aria-label="Дата записів"]').disabled).toBe(true);expect(button('Повторити')).toBeTruthy();
 await act(async()=>Simulate.click(button('Повторити')));expect(state.retry).toHaveBeenCalledTimes(1);
});
test('L05: можна повернутися до перевірки попередньої операції',async()=>{
 expect(button('Додати їжу голосом').disabled).toBe(false);await act(async()=>Simulate.click(button('Додати їжу голосом')));
 expect(container.querySelector('[data-testid="pending-modal"]').textContent).toBe('Перевірка попереднього запису');
});
test.each([false,true])('L05: вихід доступний за pending, busy=%s',async busy=>{
 state.busy=busy;await act(async()=>root.render(<ClientApp/>));const exit=button('Вийти з облікового запису');expect(exit.disabled).toBe(false);
 await act(async()=>Simulate.click(exit));expect(signOut).toHaveBeenCalledTimes(1);
});
