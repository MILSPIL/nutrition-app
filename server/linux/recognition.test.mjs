import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateTranscript} from './recognition.mjs';
test('Synthetic acceptance needs both kefir and 200 grams in Ukrainian or Russian',()=>{
 for(const text of ['Я випив кефір, двісті грамів.','Я выпил кефир, двести граммов.','200 г кефіру','кефір 200г','Кефира 200 грамм']) assert.deepEqual(evaluateTranscript(text),{recognizedFood:true,recognizedAmount:true});
 for(const text of ['кефір 20 грамів','кефір 1200 грамів','кефір 200 мл','кефір 1 200 грамів','кефір тисяча двісті грамів','кефір 0,200 грамів','кефір 200,5 грамів','кефір 200 000 грамів','кефір нуль кома двісті грамів','кефір','кефір двісті мілілітрів']) assert.deepEqual(evaluateTranscript(text),{recognizedFood:true,recognizedAmount:false});
 assert.deepEqual(evaluateTranscript('молоко 200 грамів'),{recognizedFood:false,recognizedAmount:true});
 assert.deepEqual(evaluateTranscript(null),{recognizedFood:false,recognizedAmount:false});
});
