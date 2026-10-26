import { fail } from './limits.mjs';
import { validDate } from './drafts.mjs';
const hasWord=(text,words)=>new RegExp(`(?:^|[^\\p{L}])(?:${words})(?=$|[^\\p{L}])`,'iu').test(text);
export function kyivDate(sentAt) {
 const date=new Date(sentAt);if(!Number.isFinite(date.getTime()))fail('invalid_date');
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function shiftDate(date,delta) {
 if(!validDate(date)||!Number.isInteger(delta))fail('invalid_date');
 const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+delta);
 return value.toISOString().slice(0,10);
}
export function validateDateContext(value,legacyDate) {
 if(value===undefined) return legacyDate===undefined?{mode:'default'}:validDate(legacyDate)?{mode:'pinned',targetDate:legacyDate}:fail('invalid_date');
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','targetDate'].includes(k))||!['default','pinned'].includes(value.mode))fail('invalid_date');
 if(value.mode==='default'&&value.targetDate!==undefined||value.mode==='pinned'&&!validDate(value.targetDate))fail('invalid_date');
 if(legacyDate!==undefined)fail('invalid_request');
 return {...value};
}
export function dateHints(text,sentAt) {
 const today=kyivDate(sentAt), dates=new Set(), refs=new Set(), explicitDates=new Set();
 if(hasWord(text,'сьогодні|сегодня|today')){dates.add(today);refs.add('today');}
 if(hasWord(text,'вчора|учора|вчера|yesterday')){dates.add(shiftDate(today,-1));refs.add('yesterday');}
 let invalid=false;
 for(const match of text.matchAll(/(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)/g)) {
  if(validDate(match[1])){dates.add(match[1]);explicitDates.add(match[1]);}else invalid=true;refs.add('explicit');
 }
 for(const match of text.matchAll(/(?<![\d.])(\d{2})\.(\d{2})(?:\.(\d{4}))?(?!\d|\.\d)/g)){
  if(!match[3]){
   const before=text.slice(0,match.index),after=text.slice(match.index+match[0].length);
   const clock=Number(match[1])<24&&Number(match[2])<60&&/(?:^|[^\p{L}])(?:о|об|в|at)\s*$/iu.test(before);
   const amount=/^\s*(?:грн|uah|usd|eur|₴|\$|€|г|гр|грам\p{L}*|мл|кг|g|grams?|ml|kg)(?=$|[^\p{L}])/iu.test(after);
   if(!clock&&!amount)invalid=true;
   continue;
  }
  const date=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  if(validDate(date)){dates.add(date);explicitDates.add(date);}else invalid=true;refs.add('explicit');
 }
 // Unsupported relative dates require one question instead of a guessed day.
 if(hasWord(text,'позавчора|позавчера|післязавтра|послезавтра'))invalid=true;
 return {today,dates:[...dates],explicitDates:[...explicitDates],refs:[...refs],ambiguous:invalid||dates.size>1};
}
export function turnDateContext({text,dateContext,sentAt,drafts=[]}) {
 const hints=dateHints(text,sentAt), context=validateDateContext(dateContext);
 const active=drafts.filter(d=>!['saved','saving','unknown'].includes(d.state));
 const short=/^(?:середн(?:ій|є|я)|мал(?:ий|е|еньк\p{L}*)|велик(?:ий|е|а)|средн\p{L}*|маленьк\p{L}*|больш\p{L}*|small|medium|large|\d+(?:[.,]\d+)?\s*(?:г|гр|грам\p{L}*|мл|g|ml))\s*[.!]?$/iu.test(text.trim());
 const targetDate=hints.dates[0]||(short&&active.length===1?active[0].targetDate:context.mode==='pinned'?context.targetDate:hints.today);
 return {targetDate,dateContext:context,dateResolution:hints.ambiguous?'ambiguous':hints.dates.length?'message':short&&active.length===1?'draft':context.mode==='pinned'?'pinned':'today',hints};
}
export function resolveToolDate(input,ctx,{draft}={}) {
 const snapshot=ctx.snapshot, sentAt=snapshot.sentAt||ctx.input.sentAt;
 // Existing synthetic/internal callers predate the public dayRef contract.
 if(!sentAt&&validDate(input?.targetDate)&&input.dayRef===undefined)return input.targetDate;
 const ref=input?.dayRef;if(!['today','yesterday','explicit','ambiguous','draft'].includes(ref))fail('invalid_date');
 const hints=dateHints(ctx.input.text,sentAt);
 if(hints.ambiguous||ref==='ambiguous')fail('date_clarification',409);
 let date;
 if(ref==='today'||ref==='yesterday'){
  if(input.targetDate!==undefined)fail('invalid_date');
  date=ref==='today'?hints.today:shiftDate(hints.today,-1);
 }else if(ref==='draft'){
  if(input.targetDate!==undefined||!draft)fail('date_clarification',409);date=draft.targetDate;
 }else{
  date=input.targetDate;
  const pin=snapshot.dateContext?.mode==='pinned'?snapshot.dateContext.targetDate:null;
  if(!validDate(date)||(!hints.explicitDates.includes(date)&&date!==pin))fail('invalid_date');
 }
 if(draft&&date!==draft.targetDate)fail('date_change_requires_confirmation',409);
 return date;
}
export function foodIntentAllowed(text) {
 const normalized=text.trim();
 if(/^(?:якщо|если|if)(?=$|[^\p{L}])/iu.test(normalized))return false;
 if(/^(?:(?:будь ласка|пожалуйста)[,\s]+)?(?:нагадай|напомни|покажи|перелічи|перечисли|які|какие|що\s+(?:саме\s+)?я|что\s+(?:именно\s+)?я|скільки\s+(?:я\s+)?|сколько\s+(?:я\s+)?|when did i|what did i|remind me|show me)(?=$|[^\p{L}])/iu.test(normalized))return false;
 if(/(?:не\s+буду\s+(?:їсти|есть)|планую|планирую|збираюсь|собираюсь|(?:я\s+)?хочу\s+(?:поїсти|поесть|з[’']?їсти|съесть)|going to eat|will eat)/iu.test(text)&&!/(?:вже|уже|already)\s+(?:з[’']?їв|съел|ate)/iu.test(text))return false;
 if(/(?:^|[^\p{L}])(?:не|not)\s+(?:з[’']?їв|з[’']?їла|їв|їла|съел|съела|випив|выпил|ate|eaten|drank)(?=$|[^\p{L}])/iu.test(text))return false;
 if(hasWord(text,"з[’']?їв|з[’']?їла|їв|їла|поїв|поїла|съел|съела|поел|поела|ел|ела|випив|випила|выпил|выпила|ate|eaten|drank"))return true;
 if(/^(?:добре|добро|гаразд|ок|okay|ok|так|да|yes|дякую|спасибо)[.!\s]*$/iu.test(text.trim()))return false;
 if(/^(?:скільки|сколько|чи|можна|можно|як|как|чому|почему)\s/iu.test(text.trim()))return false;
 if(/(?:планую|планирую|збираюсь|собираюсь|хочу\s+(?:з[’']?їсти|съесть)|going to eat|will eat|що\s+(?:мені\s+)?(?:краще|поїсти|їсти|залишилося)|что\s+(?:мне\s+)?(?:лучше|поесть|есть|осталось)|what.*(?:eat|left)|порадь|посоветуй)/iu.test(text))return false;
 if(/(?:запиши|запишіть|записати|додай|добавь|log|add)\s+(?:це|это|that|it)(?=$|[^\p{L}])/iu.test(text)||/^(?:запиши|додай|добавь)\s+(?:це|это)[.!\s]*$/iu.test(text.trim()))return false;
 return true;
}
