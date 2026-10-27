// Local Docker or CI, disposable VM-contained test; no mounts, ports, real keys or provider network.
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const name='scisense-systemd-'+randomUUID(),tag='scisense-systemd-check',evidence='tmp/systemd-check/evidence.json';
let attempted=false,result,activeChild,interrupted,runningCleanup=false,endpoint;
const dockerEnv={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
mkdirSync('tmp/systemd-check',{recursive:true});
// Overwrite stale proof and preserve the precise owned name even if the process is killed.
writeFileSync(evidence,JSON.stringify({containerName:name,status:'running',cleanup:false})+'\n');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{interrupted=signal;if(!runningCleanup)activeChild?.kill('SIGKILL');});
function run(args,timeout=120000){
 if(interrupted&&!runningCleanup)return Promise.reject(Error('interrupted:'+interrupted));
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',endpoint?['--host',endpoint,...args]:args,{stdio:['ignore','pipe','pipe'],env:dockerEnv}),chunks=[],errors=[];activeChild=child;let size=0,timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
  for(const [stream,target] of [[child.stdout,chunks],[child.stderr,errors]])stream.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024)child.kill('SIGKILL');else target.push(chunk);});
  child.on('error',()=>{clearTimeout(timer);if(activeChild===child)activeChild=null;reject(Error('docker_start_failed'));});
  child.on('close',code=>{
   clearTimeout(timer);if(activeChild===child)activeChild=null;const output=Buffer.concat(chunks).toString();
   if(code!==0||timedOut||size>8*1024*1024||interrupted&&!runningCleanup)reject(Error((output+Buffer.concat(errors).toString()).slice(-6000)+' docker_exit:'+code+(interrupted?' interrupted:'+interrupted:'')));
   else resolve(output.trim());
  });
 });
}
try{
 // Context inspection reads local CLI configuration, never contacts the daemon.
 endpoint=process.env.DOCKER_CONTEXT?await run(['context','inspect',process.env.DOCKER_CONTEXT,'--format','{{.Endpoints.docker.Host}}']):process.env.DOCKER_HOST||await run(['context','inspect','--format','{{.Endpoints.docker.Host}}']);
 if(!/^unix:\/\/\/[^\r\n\0]+$/.test(endpoint))throw Error('local_unix_docker_required');
 const architecture=await run(['info','--format','{{.Architecture}}']);
 const platform=({aarch64:'linux/arm64',arm64:'linux/arm64',x86_64:'linux/amd64',amd64:'linux/amd64'})[architecture];if(!platform)throw Error('native_architecture_required');
 const target=platform.split('/')[1],digest=target==='amd64'?'a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc':'18b33ff3829707f31ada654a963b9ee35f2e6f0241b964bd17a22a9b330cb63d';
 await run(['build','--platform='+platform,'--build-arg','TARGETARCH='+target,'--build-arg','UBUNTU_IMAGE=ubuntu:24.04@sha256:'+digest,'--file','server/linux/systemd.Dockerfile','--tag',tag,'.'],300000);
 attempted=true;await run(['run','--detach','--name',name,'--platform='+platform,'--privileged','--cgroupns=private','--network=none','--cpus=1','--memory=2g','--memory-swap=2g','--tmpfs','/run','--tmpfs','/run/lock',tag]);
 const config=JSON.parse(await run(['inspect',name]))[0];
 if(config.HostConfig.Binds?.length||config.HostConfig.PortBindings&&Object.keys(config.HostConfig.PortBindings).length||config.HostConfig.NetworkMode!=='none'||config.HostConfig.NanoCpus!==1e9||config.HostConfig.Memory!==2147483648||config.HostConfig.MemorySwap!==2147483648)throw Error('container_isolation_invalid');
 result=JSON.parse(await run(['exec',name,'/opt/scisense/node/bin/node','server/linux/systemd-smoke.mjs']));
 result.isolation={architecture,platform,dockerTransport:'local-unix',noHostBinds:true,noPublishedPorts:true,network:'none',cpu:config.HostConfig.NanoCpus/1e9,memoryBytes:config.HostConfig.Memory};
}catch(error){process.exitCode=1;result={passed:false,error:error.message.slice(-6000)};}
finally{
 runningCleanup=true;let cleanup=!attempted,cleanupError;
 try{
  if(attempted){
   const query=['ps','--all','--filter','name=^/'+name+'$','--format','{{.ID}}'];
   if(await run(query,30000))await run(['rm','--force',name],30000);
   if(await run(query,30000))throw Error('container_still_present');
   cleanup=true;
  }
 }catch(error){cleanup=false;cleanupError=error.message.slice(-1000);process.exitCode=1;}
 if(interrupted){process.exitCode=1;result={...result,passed:false,interrupted};}
 result={...result,containerName:name,cleanup,...(cleanupError?{cleanupError}:{})};
 writeFileSync(evidence,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
