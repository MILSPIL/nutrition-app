// Three isolated synthetic users, real demo Auth/Firestore, production bundles with a demo build flag.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc,setDoc } from 'firebase/firestore';
import { build as bundle } from '../workers/meal-parser/node_modules/esbuild/lib/main.js';
import { browserRuntime } from './browser-runtime.mjs';
const {chromium}=await browserRuntime();
if(process.env.GCLOUD_PROJECT!=='demo-scisense'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088')throw Error('demo_only');
const origin='http://127.0.0.1:4179',out='tmp/trainer-ui-qa',build=path.resolve('tmp/trainer-ui-build');await mkdir(out,{recursive:true});
const evidence={syntheticOnly:true,paidCalls:0,checks:[],layout:[],pageErrors:[],unexpectedNetwork:[]};
const check=(name,condition)=>{assert.ok(condition,name);evidence.checks.push(name);};
const today=new Date().toLocaleDateString('en-CA');
const helper=(await bundle({stdin:{contents:`
 import {initializeApp} from 'firebase/app';import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,signOut} from 'firebase/auth';import {getFirestore,connectFirestoreEmulator,doc,getDocFromServer} from 'firebase/firestore';
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-scisense',authDomain:'localhost'}),auth=getAuth(app),db=getFirestore(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8088);
 window.fixture={login:async email=>{await signInWithEmailAndPassword(auth,email,'synthetic-password-only');},read:async path=>{await auth.authStateReady();try{await getDocFromServer(doc(db,...path));return 'allowed';}catch(e){return e.code;}},logout:()=>signOut(auth)};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].contents;
const server=createServer(async(req,res)=>{
 try{const pathname=new URL(req.url,origin).pathname;
  if(pathname==='/fixture'){res.setHeader('Content-Type','text/html');return res.end('<script src="/fixture.js"></script>');}
  if(pathname==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(helper);}
  const file=path.resolve(build,['/','/trainer'].includes(pathname)?'index.html':'.'+pathname);if(!file.startsWith(build+path.sep))throw Error();
  const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404).end();}
});
let env,browser;const contexts=[];
try{
 env=await initializeTestEnvironment({projectId:'demo-scisense',firestore:{host:'127.0.0.1',port:8088,rules:await readFile('firestore.rules','utf8')}});await env.clearFirestore();
 const accounts={};
 for(const role of ['client','trainer','stranger']){
  const email=`${role}@scisense.example.test`;
  const response=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'synthetic-password-only',returnSecureToken:true})});
  const row=await response.json();assert.ok(row.localId,'synthetic account');
  const verified=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({localId:row.localId,emailVerified:true,displayName:role==='client'?'Тестовий клієнт':'Тестовий тренер'})});assert.equal(verified.status,200);
  accounts[role]={uid:row.localId,email};
 }
 const uid=accounts.client.uid;
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'users',uid),{users:{[uid]:{name:'Тестовий клієнт',gender:'чоловік',portions:{},programDay:1,currentWeight:70,startDate:today,meals:{1:{},2:{},3:{},4:{}}}},globalCustomProducts:{},productOverrides:{},writerVersion:2});
  await setDoc(doc(db,'users',uid,'mealHistory',today),{meals:{1:{'Б':[{name:'Синтетичний кефір',weight:200,portion:100,p:3,f:2,c:4}]},2:{},3:{},4:{}},totalMacros:{p:6,f:4,c:8,cal:106}});
  await setDoc(doc(db,'users',uid,'measurements','fixture'),{date:today,weight:70,waist:80});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4179,'127.0.0.1',resolve);});
 browser=await chromium.launch({headless:true,executablePath:process.env.AGENT_TEST_CHROME_EXECUTABLE});
 const pages={};
 for(const role of Object.keys(accounts)){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'uk-UA'});contexts.push(context);
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(['127.0.0.1','localhost','cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();evidence.unexpectedNetwork.push(url.origin);return route.abort();});
  await context.addInitScript(()=>localStorage.setItem('app_version_seen','1.6.0'));
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>evidence.pageErrors.push(e.message));pages[role]=page;
  await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.fixture);await page.evaluate(email=>window.fixture.login(email),accounts[role].email);
 }
 const {client,trainer,stranger}=pages;
 check('Stranger denied health data',await stranger.evaluate(p=>window.fixture.read(p),['users',uid,'mealHistory',today])==='permission-denied');
 await trainer.goto(origin+'/trainer');await trainer.getByText('Тренерський дашборд',{exact:true}).waitFor();
 await client.goto(origin);await client.getByTitle('Налаштування',{exact:true}).click();
 await client.getByRole('button',{name:/Додати тренера/}).click();await client.getByLabel('Email тренера',{exact:true}).waitFor();
 const consent=await client.getByTestId('trainer-consent').textContent();
 for(const width of [375,390,1024]){
  await client.setViewportSize({width,height:844});
  const deltas=await client.evaluate(()=>{const panel=document.querySelector('[data-testid="trainer-connection"]'),consent=panel.querySelector('p'),form=panel.querySelector('form'),header=panel.parentElement.previousElementSibling;const p=panel.getBoundingClientRect(),c=consent.getBoundingClientRect(),f=form.getBoundingClientRect(),h=header.getBoundingClientRect();return {consentLeft:c.left-p.left,formLeft:f.left-p.left,formRight:f.right-p.right,headerInset:p.left-h.left,overflow:document.documentElement.scrollWidth>innerWidth};});
  evidence.layout.push({width,...deltas});assert.deepEqual(deltas,{consentLeft:0,formLeft:0,formRight:0,headerInset:16,overflow:false});await client.screenshot({path:`${out}/consent-${width}.png`});
 }
 await client.setViewportSize({width:390,height:844});
 const connect=async()=>{await client.getByLabel('Email тренера',{exact:true}).fill(accounts.trainer.email);await client.getByRole('button',{name:'Надіслати запит',exact:true}).click();await client.getByText('Очікує підтвердження',{exact:true}).waitFor();await trainer.getByRole('button',{name:'Прийняти',exact:true}).click();await client.getByRole('button',{name:'Відкликати доступ',exact:true}).waitFor();};
 const openDetails=async()=>{await trainer.getByRole('button').filter({hasText:'Тестовий клієнт'}).click();await trainer.getByText('Синтетичний кефір',{exact:true}).waitFor();};
 await connect();await openDetails();check('Trainer reads accepted health details',true);
 await client.getByRole('button',{name:'Відкликати доступ',exact:true}).click();await client.getByLabel('Email тренера',{exact:true}).waitFor();await trainer.getByText('Синтетичний кефір',{exact:true}).waitFor({state:'hidden'});check('AddTrainerModal revoke clears open details',await trainer.getByText('Тестовий клієнт',{exact:true}).count()===0);
 await client.getByRole('button',{name:'Закрити налаштування тренера',exact:true}).click();await client.getByTitle('Налаштування',{exact:true}).click();await client.getByRole('button').filter({hasText:'Тренер'}).filter({hasText:'Не підключено'}).click();
 assert.equal(await client.getByTestId('trainer-consent').textContent(),consent);await connect();await openDetails();await client.getByRole('button',{name:'Відкликати доступ',exact:true}).click();await trainer.getByText('Синтетичний кефір',{exact:true}).waitFor({state:'hidden'});check('SettingsModal reconnect and revoke clear details',true);
 await trainer.goto(origin+'/fixture');check('Revoked trainer denied by SDK',await trainer.evaluate(p=>window.fixture.read(p),['users',uid,'mealHistory',today])==='permission-denied');
 check('No unexpected external traffic',evidence.unexpectedNetwork.length===0);check('No page exceptions',evidence.pageErrors.length===0);
 evidence.result='pass';
}catch(error){evidence.result='fail';evidence.failure=String(error.message);throw error;}
finally{await Promise.all(contexts.map(c=>c.close()));await browser?.close();await new Promise(r=>server.listening?server.close(r):r());await env?.cleanup();await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2)+'\n');}
