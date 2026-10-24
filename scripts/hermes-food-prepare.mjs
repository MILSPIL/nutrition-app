import {mkdirSync,readFileSync,createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {importFoodData} from './food-data-import.mjs';
const manifest=JSON.parse(readFileSync('server/trainer/food-data-manifest.json'));
const dir='.agents/runtime/food-data';mkdirSync(dir,{recursive:true});
for(const source of manifest.sources){
 const response=await fetch(source.url,{signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error('public_food_download');
 await pipeline(Readable.fromWeb(response.body),createWriteStream(join(dir,source.file),{flags:'wx'}));
}
const result=await importFoodData({archives:dir,output:join(dir,'foods-v1-reviewed.sqlite')});
if(result.sha256!=='a8e60fe05956869df3bc9d04371994c5ff8adf0d6014e474457f52191b591ad8')throw Error('index_reproduction_failed');
console.log(JSON.stringify(result));
