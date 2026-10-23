import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyFixtureModel} from './models.mjs';
import {verifyWhisper,WHISPER_SOURCE} from '../../scripts/phone-lab/whisper.mjs';
test('Synthetic allowlist rejects unknown names and wrong source before file access',async()=>{
 for(const name of ['tiny','small','small.en','__proto__','constructor']) await assert.rejects(verifyFixtureModel(name,{}),/fixture_model_unverified/);
 await assert.rejects(verifyFixtureModel('small-q5_1',{sourceCommit:'wrong'}),/fixture_model_unverified/);
});
test('Both fixture models reject corrupted weights; production does not accept the small pin',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scisense-model-test-'));
 try {
  const model=join(dir,'model.bin');await writeFile(model,'synthetic corrupt model');
  for(const name of ['small-q5_1','large-v3-turbo-q5_0']) await assert.rejects(verifyFixtureModel(name,{binary:process.execPath,model,sourceCommit:WHISPER_SOURCE}),/fixture_model_unverified/);
  await assert.rejects(verifyWhisper({sourceCommit:WHISPER_SOURCE,modelSha1:'small-q5_1'}),/whisper_unverified/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
