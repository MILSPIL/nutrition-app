// Diagnostic only: actual validators/snapshot with synthetic fixtures, no network.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');
(async () => {
  const root = path.resolve(process.argv[2] || process.cwd());
  const expectedNode = 'v' + fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  if (process.version !== expectedNode) throw new Error('wrong_node_runtime');
  const req = createRequire(path.join(root, 'package.json'));
  const babel = req('@babel/core');
  const source = fs.readFileSync(path.join(root, 'src/services/mealItems.js'), 'utf8');
  const compiled = babel.transformSync(source, {presets:[req.resolve('@babel/preset-env')],babelrc:false,configFile:false}).code;
  const box = {exports:{},require: () => ({validatedPlanMatch:x=>x})};
  vm.runInNewContext(compiled,box,{filename:'src/services/mealItems.js'});
  const {itemProblems,itemMacros} = box.exports;
  const unknown = {itemId:'synthetic-item',name:'Синтетичний плід',quantity:{value:1,unit:'portion'},nutritionBasis:{value:null,unit:'portion'},nutrients:{p:null,f:null,c:null,cal:null},source:{kind:'estimate'},estimated:true,clarification:'Уточніть розмір.'};
  const estimate = {...unknown,nutritionBasis:{value:1,unit:'portion'},nutrients:{p:1,f:2,c:10,cal:62},clarification:''};
  const badUnits={...estimate,quantity:{value:1,unit:'g'}};
  const {buildSnapshot}=await import(pathToFileURL(path.join(root,'server/trainer/snapshot.mjs')));
  const input={conversationId:'synthetic-conversation',historyRevision:1,context:'Synthetic coaching preferences',contextRevision:1,draft:null,receipts:[],day:{date:'2026-01-02',revision:1,meals:{}},plan:{},message:'Що краще поїсти?',sentAt:'2026-01-02T10:00:00.000Z'};
  const normal=buildSnapshot(input);
  let error=null;
  try{buildSnapshot({...input,context:'x'.repeat(80000)});}catch(e){error=e.code||e.message;}
  const header=fs.readFileSync(path.join(root,'src/components/Header.js'),'utf8');
  const client=fs.readFileSync(path.join(root,'src/pages/ClientApp.js'),'utf8');
  const trees=Object.fromEntries(['src','server','workers'].map(p=>[p,execFileSync('git',['rev-parse','HEAD:'+p],{cwd:root,encoding:'utf8'}).trim()]));
  const out={schemaVersion:1,node:process.version,baseHead:'86ad3bed8ad2a25c1fa0a9543b9db8585db95e3f',codeTrees:trees,syntheticOnly:true,networkCalls:0,providerCalls:0,privateProfileRead:false,
    oldForm:{unknownPortionRejected:itemProblems(unknown).length>0,issues:Array.from(itemProblems(unknown)),completeExplicitEstimateAccepted:itemProblems(estimate).length===0,syntheticCalories:itemMacros(estimate).cal,incompatibleUnitsRejected:itemProblems(badUnits).length>0},
    snapshot:{normalAccepted:normal.message===input.message,oversizedSyntheticBytes:80000,oversizedRejected:error==='context_too_large',error},
    sourceObservation:{headerVoiceEntryPresent:header.includes('onShowVoiceInput'),singleTrainerComponentPresent:client.includes('<TrainerChat'),floatingEntryPresent:client.includes('<TrainerLauncher')},
    notProven:['real provider output','production release contents','phone UI','private context migration','Telegram delivery','household measure source quality']};
  console.log(JSON.stringify(out,null,2));
  if(!out.oldForm.unknownPortionRejected||!out.oldForm.completeExplicitEstimateAccepted||out.oldForm.syntheticCalories!==62||!out.oldForm.incompatibleUnitsRejected||!out.snapshot.normalAccepted||!out.snapshot.oversizedRejected||out.sourceObservation.floatingEntryPresent)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
