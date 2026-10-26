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
jest.mock('../components/PilotPanel',()=>p=>{mockPilotVersion=p.version;return null;});
jest.mock('../components/VoiceInputModal',()=>p=>{mockVoiceProps=p;return p.isOpen?<div data-testid="pending-modal">{p.pendingSave?'Перевірка попереднього запису':'Нова чернетка'}</div>:null;});
jest.mock('../components',()=>{
 const React=require('react');const Header=jest.requireActual('../components/Header').default;const empty=()=>null;
 const DaySelectorModal=props=>{mockDayProps=props;return null;};
 return {Header,ToastProvider:({children})=><>{children}</>,toast:{error:jest.fn()},LoginScreen:empty,MealSection:empty,ProductModal:empty,ReportModal:empty,AddCustomProductModal:empty,PortionSettingsModal:empty,DaySelectorModal,AccountSwitchModal:empty,SettingsModal:empty,ActivitySection:empty,RulesSection:empty,LoadingScreen:empty,WelcomeModal:empty,AddTrainerModal:empty,MeasurementsModal:empty,MeasurementReminderModal:empty};
});
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,container,state;
let mockVoiceProps,mockPilotVersion,mockDayProps;
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

test('review: голос бере snapshot перечитаного дня, а не застарілий users',async()=>{
 const fresh={profile:{portions:{яблуко:350}},globalCustomProducts:{},productOverrides:{}};
 state.day={...state.day,planContext:fresh};state.hasPending=false;
 await act(async()=>root.render(<ClientApp/>));expect(mockVoiceProps.planContext).toBe(fresh);
 state.requiresReload=true;await act(async()=>root.render(<ClientApp/>));expect(button('Додати їжу голосом').disabled).toBe(true);
});

test('review: ACK і retry оновлюють PilotPanel навіть коли форма закрита',async()=>{
 state.commit=jest.fn(async()=>({}));await act(async()=>root.render(<ClientApp/>));const before=mockPilotVersion;
 await act(async()=>mockVoiceProps.onAdd({},mockVoiceProps.date));expect(mockPilotVersion).toBe(before+1);
 await act(async()=>mockVoiceProps.onRetryPending());expect(mockPilotVersion).toBe(before+2);
});

test('номер дня відкриває його дату без зміни записів харчування',async()=>{
 getDoc.mockResolvedValue({exists:()=>true,data:()=>({users:{'demo-owner':{name:'Синтетичний користувач',startDate:'2026-10-20',portions:{}}}})});
 await act(async()=>root.unmount());root=createRoot(container);
 state.hasPending=false;state.commit=jest.fn();
 await act(async()=>root.render(<ClientApp/>));
 await act(async()=>mockDayProps.onDayChange(6));
 expect(useMealDay.mock.calls.at(-1)[2]).toBe('2026-10-25');
 expect(state.commit).not.toHaveBeenCalled();
 expect(mockDayProps.disabled).toBe(false);
});

test('перехід за номером дня заблокований під час непідтвердженого запису',async()=>{
 const before=useMealDay.mock.calls.at(-1)[2];
 expect(mockDayProps.disabled).toBe(true);
 await act(async()=>mockDayProps.onDayChange(6));
 expect(useMealDay.mock.calls.at(-1)[2]).toBe(before);
});
