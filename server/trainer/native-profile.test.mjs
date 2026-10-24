import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, mkdirSync, rmSync, unlinkSync, symlinkSync, linkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as native from "./hermes-native.mjs";
const template=JSON.parse(readFileSync(new URL("./profile-template.json",import.meta.url)));
function fixture(t) {
 const p=realpathSync(mkdtempSync(join(tmpdir(),"scisense-profile-contract-")));
 for(const [name,text] of Object.entries(template))writeFileSync(join(p,name),text,{mode:0o600});
 writeFileSync(join(p,"config.yaml"),readFileSync(new URL("./hermes-config.json",import.meta.url)),{mode:0o600});
 t.after(()=>rmSync(p,{recursive:true,force:true}));return p;
}
test("C05 actual native profile must match the public template",t=>{
 const p=fixture(t);assert.equal(typeof native.verifyNativeProfile,"function");
 assert.doesNotThrow(()=>native.verifyNativeProfile(p));
 mkdirSync(join(p,"memories"));assert.doesNotThrow(()=>native.verifyNativeProfile(p));
});
for(const name of Object.keys(template))test(`C05 refuses changed ${name} before starting native`,t=>{
 const p=fixture(t);writeFileSync(join(p,name),"UNAPPROVED_SYNTHETIC_PROFILE");
 assert.throws(()=>native.verifyNativeProfile(p),/hermes_profile_invalid/);
});
test("C05 refuses missing, aliased and extra native memory",t=>{
 const p=fixture(t),file=join(p,"USER.md"),outside=join(p,"synthetic-other");
 unlinkSync(file);assert.throws(()=>native.verifyNativeProfile(p),/hermes_profile_invalid/);
 writeFileSync(outside,template["USER.md"]);symlinkSync(outside,file);
 assert.throws(()=>native.verifyNativeProfile(p),/hermes_profile_invalid/);
 unlinkSync(file);linkSync(outside,file);assert.throws(()=>native.verifyNativeProfile(p),/hermes_profile_invalid/);
 unlinkSync(file);writeFileSync(file,template["USER.md"]);mkdirSync(join(p,"memories"));
 writeFileSync(join(p,"memories","USER.md"),"UNAPPROVED_SYNTHETIC_MEMORY");
 assert.throws(()=>native.verifyNativeProfile(p),/hermes_profile_invalid/);
 rmSync(join(p,"memories"),{recursive:true});symlinkSync(join(p,"missing-memory"),join(p,"memories"));
 assert.throws(()=>native.verifyNativeProfile(p),/hermes_profile_invalid/);
});
test("C05 native config is checked with the actual profile",t=>{
 const p=fixture(t);writeFileSync(join(p,"config.yaml"),'{}');
 assert.throws(()=>native.verifyNativeProfile(p),/hermes_config_invalid/);
});
