import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import AddTrainerModal from '../components/client/AddTrainerModal';
import SettingsModal from '../components/SettingsModal';
import ClientDetailsModal from '../components/trainer/ClientDetailsModal';
import TrainerDashboard from '../pages/TrainerDashboard';
import PendingRequests from '../components/trainer/PendingRequests';
import { __access, TRAINER_CONSENT } from './trainerAccess';
import { __streams, getDocsFromServer, runTransaction } from 'firebase/firestore';
import { __authListeners } from 'firebase/auth';
jest.mock('../firebase',()=>({db:{},auth:{},googleProvider:{}}));
jest.mock('../components/AnimatedModal',()=>({__esModule:true,default:({isOpen,children})=>isOpen?<div>{children}</div>:null}));
jest.mock('../components',()=>({LoadingScreen:()=>null,ToastProvider:({children})=><>{children}</>,toast:{error:jest.fn(),success:jest.fn()}}));
jest.mock('../components/Toast',()=>({toast:{error:jest.fn(),success:jest.fn(),warning:jest.fn()}}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}),{virtual:true});
jest.mock('firebase/auth',()=>{const listeners=[];return {__authListeners:listeners,onAuthStateChanged:(auth,fn)=>{listeners.push(fn);return ()=>{};},signInWithPopup:jest.fn(),signOut:jest.fn()};});
jest.mock('firebase/firestore',()=>{
 const streams=[];
 return {__streams:streams,doc:(db,...parts)=>parts.join('/'),collection:(db,...parts)=>parts.join('/'),query:(ref,...rest)=>ref,where:()=>null,orderBy:()=>null,limit:()=>null,
  getDocsFromServer:jest.fn(),runTransaction:jest.fn(),serverTimestamp:()=>({}),
  onSnapshot:(ref,options,next,error)=>{const row={ref,next,error,off:()=>{}};streams.push(row);return row.off;}};
});
jest.mock('./trainerAccess',()=>{
 const actual=jest.requireActual('./trainerAccess');const access={readState:jest.fn(),request:jest.fn(),accept:jest.fn(),finishPending:jest.fn(),disconnect:jest.fn(),clearLegacy:jest.fn(),deleteLegacyPending:jest.fn()};
 return {...actual,__access:access,createTrainerAccess:()=>access};
});
global.IS_REACT_ACT_ENVIRONMENT=true;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const stamp={toMillis:()=>1000,toDate:()=>new Date(1000)};
let root,container,user,props;
const pending=()=>({clientId:user.uid,clientEmail:user.email,clientName:'Клієнт',trainerEmail:'trainer@example.test',status:'pending',generation:1,revision:1,createdAt:stamp});
const accepted=()=>({...pending(),status:'accepted',revision:2,trainerId:'trainer',trainerName:'Погоджений тренер',acceptedAt:stamp});
const state=(request=null)=>({profile:{trainerId:request?.status==='accepted'?'trainer':null},request,repair:false,legacy:false});
const render=async(Component=AddTrainerModal,patch={})=>{props={...props,...patch};await act(async()=>root.render(<Component {...props}/>));};
const button=text=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
const click=async text=>{const b=button(text);expect(b).toBeTruthy();expect(b.disabled).toBe(false);await act(async()=>Simulate.click(b));};
const submit=async()=>{await act(async()=>Simulate.change(container.querySelector('input[type="email"]'),{target:{value:'trainer@example.test'}}));await act(async()=>Simulate.submit(container.querySelector('form')));};
const snapshot=data=>({metadata:{fromCache:false},exists:()=>data!=null,data:()=>data,docs:[]});
const stream=ref=>__streams.filter(s=>s.ref===ref).at(-1);
beforeEach(()=>{
 jest.useRealTimers();Object.values(__access).forEach(fn=>fn.mockReset());__streams.length=0;__authListeners.length=0;
 user={uid:`client-${Date.now()}-${Math.random()}`,email:'client@example.test',emailVerified:true};props={isOpen:true,onClose:jest.fn(),firebaseUser:user,userName:'Клієнт'};
 __access.readState.mockResolvedValue(state());getDocsFromServer.mockResolvedValue({docs:[]});
 runTransaction.mockImplementation(async(db,fn)=>fn({get:async()=>({exists:()=>true}),set:jest.fn()}));
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();jest.useRealTimers();});
test('A06 both client dialogs show the same complete consent',async()=>{
 await render();expect(container.querySelector('[data-testid="trainer-consent"]').textContent).toBe(TRAINER_CONSENT);
 await render(SettingsModal);const trainerButton=[...container.querySelectorAll('button')].find(b=>b.textContent.includes('Тренер')&&b.textContent.includes('Не підключено'));
 await act(async()=>Simulate.click(trainerButton));expect(container.querySelector('[data-testid="trainer-consent"]').textContent).toBe(TRAINER_CONSENT);
});
test('A06 request waits for ACK; timeout and reopening do not create a second cycle',async()=>{
 const wait=deferred();__access.request.mockReturnValue(wait.promise);await render();jest.useFakeTimers();await submit();
 expect(__access.request).toHaveBeenCalledTimes(1);expect(container.textContent).not.toContain('Запит надіслано.');
 await act(async()=>jest.advanceTimersByTime(10001));expect(container.textContent).toContain('Результат ще не підтверджено');
 await render(AddTrainerModal,{isOpen:false});await render(AddTrainerModal,{isOpen:true});
 expect(button('Надіслати запит').disabled).toBe(true);await submit();expect(__access.request).toHaveBeenCalledTimes(1);
 __access.readState.mockResolvedValue(state(pending()));await act(async()=>wait.resolve());
 expect(container.textContent).toContain('Очікує підтвердження');expect(container.querySelector('form')).toBeNull();
});
test.each([AddTrainerModal,SettingsModal])('A06 revoke failure stays visible and server reconciliation unlocks UI (%p)',async Component=>{
 __access.readState.mockResolvedValue(state(accepted()));__access.disconnect.mockRejectedValue(Object.assign(Error(),{code:'permission-denied'}));await render(Component);
 if(Component===SettingsModal){const b=[...container.querySelectorAll('button')].find(b=>b.textContent.includes('Тренер')&&b.textContent.includes('trainer@example.test'));await act(async()=>Simulate.click(b));}
 await click('Відкликати доступ');expect(container.textContent).toContain('Немає дозволу');expect(container.textContent).not.toContain('Доступ тренера відкликано.');
 expect(button('Відкликати доступ').disabled).toBe(true);
 __access.readState.mockResolvedValue(state({...accepted(),status:'disconnected',revision:3,endedAt:stamp}));await click('Перевірити стан');
 expect(button('Відкликати доступ')).toBeUndefined();expect(container.querySelector('form')).toBeTruthy();
});
test('A06 an old read after close/reopen cannot restore a stale trainer',async()=>{
 const old=deferred();__access.readState.mockReturnValueOnce(old.promise);await render();await render(AddTrainerModal,{isOpen:false});
 __access.readState.mockResolvedValue(state(pending()));await render(AddTrainerModal,{isOpen:true});
 await act(async()=>old.resolve(state(accepted())));expect(container.textContent).toContain('Очікує підтвердження');expect(container.textContent).not.toContain('Погоджений тренер');
});
test('A06 details clear all health state on denial and ignore later callbacks',async()=>{
 const client={id:'client',name:'Клієнт'};props={isOpen:true,onClose:jest.fn(),onAccessLost:jest.fn(),client};await render(ClientDetailsModal);
 const meals=__streams.find(s=>s.ref.startsWith('users/client/mealHistory/'));
 const dates=stream('users/client/mealHistory'),measurements=stream('users/client/measurements');
 const food={meals:{1:{'Б':[{name:'Секретний кефір',weight:200,portion:100,p:3,f:2,c:4}]}},totalMacros:{p:6,f:4,c:8,cal:106}};
 await act(async()=>{meals.next(snapshot(food));measurements.next({...snapshot({}),docs:[{id:'one',data:()=>({date:'2026-10-21',weight:70})}]});dates.next({...snapshot({}),docs:[{id:'2026-10-21'}]});});
 expect(container.textContent).toContain('Секретний кефір');
 await act(async()=>meals.error({code:'permission-denied'}));expect(container.textContent).not.toContain('Секретний кефір');expect(props.onAccessLost).toHaveBeenCalledTimes(1);
 await act(async()=>{meals.next(snapshot(food));measurements.next({...snapshot({}),docs:[{id:'old',data:()=>({date:'2026-10-21',weight:99})}]});});
 expect(container.textContent).not.toContain('Секретний кефір');expect(container.textContent).not.toContain('99');
});
test('A06 roster removal closes details, clears meals and fences stale deliveries; signout clears all',async()=>{
 props={};await render(TrainerDashboard);await act(async()=>__authListeners.at(-1)({uid:'trainer',email:'trainer@example.test',emailVerified:true}));
 const roster=stream('trainers/trainer');await act(async()=>roster.next(snapshot({clients:{client:{name:'Клієнт один',email:'client@example.test',generation:1}}})));
 const meal=__streams.find(s=>s.ref.startsWith('users/client/mealHistory/'));
 await act(async()=>meal.next(snapshot({totalMacros:{p:100,cal:999}})));
 const card=[...container.querySelectorAll('button')].find(b=>b.textContent.includes('Клієнт один'));
 await act(async()=>Simulate.click(card));expect(container.querySelector('.fixed h1')?.textContent).toBe('Клієнт один');
 await act(async()=>{roster.next(snapshot({clients:{}}));expect(container.textContent).not.toContain('Клієнт один');});
 await act(async()=>meal.next(snapshot({totalMacros:{p:100,cal:999}})));expect(container.textContent).not.toContain('999');
 await act(async()=>__authListeners.at(-1)(null));await act(async()=>roster.next(snapshot({clients:{client:{name:'Клієнт один',generation:1}}})));
 expect(container.textContent).not.toContain('Клієнт один');expect(container.textContent).toContain('Увійти через Google');
});

test('A06 canonical pending remains actionable after query metadata is added',async()=>{
 props={firebaseUser:{uid:'trainer',email:'trainer@example.test',emailVerified:true},ready:true};await render(PendingRequests);
 await act(async()=>stream('trainerRequests').next({...snapshot({}),docs:[{id:user.uid,data:()=>pending()}]}));
 expect(button('Прийняти').disabled).toBe(false);expect(button('Відхилити').disabled).toBe(false);
 const wait=deferred();__access.accept.mockReturnValue(wait.promise);await click('Прийняти');
 expect(button('Прийняти').disabled).toBe(true);expect(__access.accept).toHaveBeenCalledWith(props.firebaseUser,user.uid,{generation:1,revision:1});
 expect(container.textContent).not.toContain('Запит прийнято.');await act(async()=>wait.resolve());expect(container.textContent).toContain('Запит прийнято.');
});
test('A06 failed accept is visible and legacy or malformed requests cannot be accepted',async()=>{
 props={firebaseUser:{uid:'trainer',email:'trainer@example.test',emailVerified:true},ready:true};await render(PendingRequests);
 const next=async(id,payload)=>act(async()=>stream('trainerRequests').next({...snapshot({}),docs:[{id,data:()=>payload}]}));
 await next(user.uid,pending());__access.accept.mockRejectedValue(Object.assign(Error(),{code:'permission-denied'}));await click('Прийняти');
 expect(container.textContent).toContain('Немає дозволу');expect(container.textContent).not.toContain('Запит прийнято.');
 await next('old-random',pending());expect(button('Прийняти')).toBeUndefined();expect(button('Прибрати старий запит')).toBeTruthy();
 await next(user.uid,{...pending(),unexpected:true});expect(button('Прийняти').disabled).toBe(true);
 await next(user.uid,{...pending(),id:'bad'});expect(button('Прийняти').disabled).toBe(true);
});
test('A06 unsubscribed callbacks cannot clear a reopened dialog for the same user',async()=>{
 await render();const old=stream(`trainerRequests/${user.uid}`);await render(AddTrainerModal,{isOpen:false});
 __access.readState.mockResolvedValue(state(pending()));await render(AddTrainerModal,{isOpen:true});
 const reads=__access.readState.mock.calls.length;await act(async()=>{old.error({code:'permission-denied'});old.next(snapshot({}));});
 expect(__access.readState).toHaveBeenCalledTimes(reads);expect(container.textContent).toContain('Очікує підтвердження');expect(button('Скасувати запит').disabled).toBe(false);
});

test('A06 trainer reconciliation stays available without unlocking an unacknowledged accept',async()=>{
 props={firebaseUser:{uid:'trainer',email:'trainer@example.test',emailVerified:true},ready:true};await render(PendingRequests);
 const row={id:user.uid,data:()=>pending()};await act(async()=>stream('trainerRequests').next({...snapshot({}),docs:[row]}));
 const wait=deferred();__access.accept.mockReturnValue(wait.promise);jest.useFakeTimers();await click('Прийняти');
 await act(async()=>jest.advanceTimersByTime(10001));expect(container.textContent).toContain('Результат ще не підтверджено');
 await click('Перевірити запити');await act(async()=>stream('trainerRequests').next({...snapshot({}),docs:[row]}));
 expect(button('Прийняти').disabled).toBe(true);expect(__access.accept).toHaveBeenCalledTimes(1);
 await act(async()=>stream('trainerRequests').next({...snapshot({}),docs:[]}));expect(button('Прийняти')).toBeUndefined();
 await act(async()=>wait.resolve());expect(__access.accept).toHaveBeenCalledTimes(1);
});
