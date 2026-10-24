const fs=require('fs'),vm=require('vm'),{createRequire}=require('module');
const root=process.argv[2];const req=createRequire(root+'/package.json');
const babel=req('@babel/core'),React=req('react'),SSR=req('react-dom/server');
const compile=(file,imports)=>{const source=fs.readFileSync(root+'/'+file,'utf8');const code=babel.transformSync(source,{presets:[req.resolve('@babel/preset-env'),req.resolve('@babel/preset-react')],babelrc:false,configFile:false}).code;const box={exports:{},require:name=>imports[name]||{},process:{env:{}},crypto:require('crypto').webcrypto,localStorage:{getItem:()=>null},window:{}};vm.runInNewContext(code,box,{filename:file});return box.exports;};
const meal=compile('src/services/mealItems.js',{'./planCatalog':{validatedPlanMatch:x=>x}});
const icons=new Proxy({},{get:()=>()=>null});
const modal=compile('src/components/VoiceInputModal.js',{'react':React,'lucide-react':icons,'../services/mealItems':meal,'../services/planCatalog':{buildPlanCatalog:()=>({valid:false,entries:[]}),planFingerprint:()=>''},'../services/planAllocation':{assignPlanItems:x=>x,dailyPlanProgress:()=>({}),allocationCounts:()=>({})},'./DecimalInput':()=>null,'./PlanAllocationFields':()=>null});
const html=SSR.renderToStaticMarkup(React.createElement(modal.default,{isOpen:true,date:'2026-01-02',activeDate:'2026-01-02',meal:2,ownerKey:'synthetic',onClose:()=>{},onAdd:()=>{}}));
const item={itemId:'synthetic-1',name:'Тушкована картопля',quantity:{value:200,unit:'g'},nutritionBasis:{value:100,unit:'g'},nutrients:{p:null,f:null,c:null,cal:null},source:{kind:'estimate'},clarification:'Уточніть харчові значення'};
const full={...item,nutrients:{p:2,f:3,c:20,cal:115},clarification:''};
const bad={...full,quantity:{value:200,unit:'ml'}};
let rejected=false;try{meal.itemMacros(bad)}catch(e){rejected=e.message==='invalid_item'}
const out={sourceSha:require('child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),method:'SSR actual VoiceInputModal with inert dependency stubs; actual mealItems functions with only unused plan matcher stub; no network',ready:{textarea:html.includes('<textarea'),textInput:/<input[^>]*type="text"/.test(html),explicitStart:html.includes('Почати запис')},unknownFood:{problems:meal.itemProblems(item),accepted:meal.itemProblems(item).length===0},completeEstimate:{accepted:meal.itemProblems(full).length===0,totals:meal.itemMacros(full)},invariant:{incompatibleUnitsRejected:rejected},futureCriteria:{H01_emptyTextComposer:'FAIL',H03_unknownNutritionSave:'FAIL'},notProven:['live model response','production behavior','Hermes runtime','browser event sequence']};
console.log(JSON.stringify(out,null,2));
if(out.ready.textarea||!out.ready.explicitStart||out.unknownFood.accepted||!out.completeEstimate.accepted||!rejected)process.exitCode=1;
