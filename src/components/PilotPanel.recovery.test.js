import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import PilotPanel from './PilotPanel';import {readSubmission} from '../services/mealStore';
jest.mock('../services/mealStore',()=>({readSubmission:jest.fn()}));
global.IS_REACT_ACT_ENVIRONMENT=true;
test('review: підтвердження маркера після повтору виправляє unknown, правильність лишається за власником',async()=>{
 const row={attemptId:'one',submissionId:'2026-10-23~one',startedAt:Date.now(),status:'unknown',correct:false};
 const ledger={enabled:true,cleanup:async()=>{},list:async()=>[row],invalid:()=>false,update:async(_id,patch)=>Object.assign(row,patch)};
 const container=document.createElement('div'),root=createRoot(container);
 try {
 readSubmission.mockResolvedValue(false);await act(async()=>root.render(<PilotPanel ledger={ledger} uid="demo" version={0}/>));expect(row.status).toBe('unknown');
 readSubmission.mockResolvedValue(true);await act(async()=>root.render(<PilotPanel ledger={ledger} uid="demo" version={1}/>));expect(row.status).toBe('saved');expect(row.correct).toBe(false);expect(container.textContent).toContain('Запис правильний і повний');
 }finally{await act(async()=>root.unmount());}
});
