import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import {useMealDay} from './useMealDay';import {loadMealDay,commitMealDay,commandHash} from './mealStore';
jest.mock('./mealStore',()=>({loadMealDay:jest.fn(),commitMealDay:jest.fn(),commandHash:jest.fn(async()=> 'hash')}));
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,container,hook,props;const empty={meals:{1:{},2:{},3:{},4:{}},revision:0};
function Probe(p){hook=useMealDay(p.uid,p.profile,p.date);return null;}
const render=async(p={})=>{Object.assign(props,p);await act(async()=>root.render(<Probe {...props}/>));};
beforeEach(async()=>{jest.clearAllMocks();container=document.createElement('div');root=createRoot(container);props={uid:'owner',profile:'owner',date:'2026-10-23'};loadMealDay.mockResolvedValue(empty);await render();});
afterEach(async()=>{await act(async()=>root.unmount());});
const command={type:'appendAllocated',submissionId:'one',items:[]};
test.each(['plan_conflict','revision_conflict','submission_conflict'])('L05: %s звільняє pending, але вимагає перечитування',async code=>{
 commitMealDay.mockRejectedValueOnce(Error(code));await act(async()=>{await expect(hook.commit(command)).rejects.toThrow(code);});
 expect(hook.hasPending).toBe(false);expect(hook.requiresReload).toBe(true);
 await act(async()=>{await expect(hook.commit({...command,submissionId:'two'})).rejects.toThrow('not_ready');});
 await act(async()=>hook.reload());expect(hook.requiresReload).toBe(false);
 commitMealDay.mockResolvedValue({...empty,revision:1});await act(async()=>hook.commit({...command,submissionId:'two'}));expect(hook.hasPending).toBe(false);
});
test('L05: reload без маркера зберігає unknown; retry та сама команда',async()=>{
 commitMealDay.mockRejectedValueOnce(Error('save_unknown'));await act(async()=>{await expect(hook.commit(command)).rejects.toThrow('save_unknown');});
 const first=commitMealDay.mock.calls[0][3];await act(async()=>hook.reload());expect(hook.hasPending).toBe(true);expect(hook.error).toContain('Результат збереження ще не підтверджено');
 await act(async()=>{await expect(hook.commit({...command,submissionId:'different'})).rejects.toThrow('pending_save');});
 commitMealDay.mockResolvedValue({...empty,revision:1});await act(async()=>hook.retry());expect(commitMealDay.mock.calls[1][3]).toEqual(first);
});
test('L05: серверний marker після reload підтверджує unknown без повторного commit',async()=>{
 commitMealDay.mockRejectedValueOnce(Error('save_unknown'));await act(async()=>{await expect(hook.commit(command)).rejects.toThrow();});
 loadMealDay.mockResolvedValue({...empty,submissionMarkers:{one:'hash'},revision:1});await act(async()=>hook.reload());
 expect(commandHash).toHaveBeenCalled();expect(hook.hasPending).toBe(false);expect(commitMealDay).toHaveBeenCalledTimes(1);
});
test('L05: вихід дозволений навіть за unknown',async()=>{
 commitMealDay.mockRejectedValueOnce(Error('save_unknown'));await act(async()=>{await expect(hook.commit(command)).rejects.toThrow();});await render({uid:null,profile:null});expect(hook.hasPending).toBe(false);
});
