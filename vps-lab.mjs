// Linux-only integration lab. Runs the real provider, Nginx and existing rsyslog.
// Its state/credentials/evidence live outside the source checkout.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes, X509Certificate,createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const root=process.cwd(),stateDir='/var/lib/waytrace-lab',mode=process.argv[2];
if(process.platform!=='linux')throw new Error('This lab requires Linux');
fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
const stateFile=path.join(stateDir,'state.json'),secretFile=path.join(stateDir,'credentials.env');
const pidFile=path.join(stateDir,'supervisor.pid');
const run=(bin,args)=>execFileSync(bin,args,{stdio:'pipe',encoding:'utf8'});
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
const request=async(route,method='GET',data,tenant=state?.tenantId)=>{
 const response=await fetch('http://127.0.0.1:8080'+route+(tenant?'?tenant_id='+tenant:''),{method,headers:{Authorization:'Bearer '+state.adminToken,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 if(!response.ok)throw new Error(`Management request ${route}: ${response.status}`);return response.json();
};
async function until(fn,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await delay(200);}throw new Error('Timed out waiting for lab condition');}
const children=[];
let stopping=false;
async function shutdown(code=0) {
 if(stopping)return;stopping=true;
 const exit=async p=>{if(!p||p.exitCode!==null||p.signalCode)return;p.kill('SIGTERM');await Promise.race([new Promise(r=>p.once('exit',r)),delay(25000)]);if(p.exitCode===null&&!p.signalCode)p.kill('SIGKILL');};
 // Stop new traffic, let rsyslog save/forward its queue, then stop the provider.
 for(const p of children.slice(1).reverse())await exit(p);
 await exit(children[0]);
 if(fs.existsSync(pidFile)&&fs.readFileSync(pidFile,'utf8').trim()===String(process.pid))fs.unlinkSync(pidFile);
 process.exit(code);
}
function child(bin,args,env={}) {
 const log=fs.openSync(path.join(stateDir,path.basename(bin)+'-'+children.length+'.log'),'a',0o600);
 const p=spawn(bin,args,{cwd:root,env:{...process.env,...env},stdio:['ignore',log,log]});fs.closeSync(log);children.push(p);
 p.on('error',()=>shutdown(1));p.on('exit',code=>{if(!stopping){console.error('Lab child exited:',code);shutdown(1);}});return p;
}
async function serve(){
 if(fs.existsSync(pidFile)) {
  const pid=Number(fs.readFileSync(pidFile,'utf8'));if(Number.isInteger(pid)&&fs.existsSync('/proc/'+pid))throw new Error('Lab supervisor already running; stop it first');
 }
 fs.writeFileSync(pidFile,String(process.pid),{mode:0o600});
 process.on('SIGTERM',()=>shutdown());process.on('SIGINT',()=>shutdown());
 setTimeout(()=>shutdown(),3600000); // Bound unattended test infrastructure to one hour.
 if(!state){
  const pki=path.join(stateDir,'pki');fs.mkdirSync(pki,{mode:0o700});
  run('openssl',['req','-x509','-newkey','rsa:3072','-nodes','-keyout',pki+'/ca.key','-out',pki+'/ca.crt','-days','2','-subj','/CN=WayTrace isolated lab CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign']);
  run('openssl',['req','-new','-newkey','rsa:3072','-nodes','-keyout',pki+'/server.key','-out',pki+'/server.csr','-subj','/CN=localhost']);
  fs.writeFileSync(pki+'/server.ext','basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n');
  run('openssl',['x509','-req','-in',pki+'/server.csr','-CA',pki+'/ca.crt','-CAkey',pki+'/ca.key','-CAcreateserial','-out',pki+'/server.crt','-days','2','-extfile',pki+'/server.ext']);
  state={adminToken:randomBytes(32).toString('hex'),username:'waytrace-lab',password:randomBytes(24).toString('base64url'),pki};
  fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
  fs.writeFileSync(secretFile,`LAB_USERNAME=${state.username}\nLAB_PASSWORD=${state.password}\nLAB_ADMIN_TOKEN=${state.adminToken}\n`,{mode:0o600});
 }
 child(process.execPath,['server/index.js'],{ADMIN_TOKEN:state.adminToken,HTTP_HOST:'127.0.0.1',HTTP_PORT:'8080',COLLECTOR_HOST:'localhost',TLS_HOST:'::',TLS_PORT:'6514',TLS_CA:state.pki+'/ca.crt',TLS_CERT:state.pki+'/server.crt',TLS_KEY:state.pki+'/server.key',DATA_DIR:stateDir+'/data',LLM_PROVIDER:'disabled',WAZUH_ENABLED:'false'});
 await until(()=>fetch('http://127.0.0.1:8080/api/health').then(r=>r.ok));
 if(!state.sourceId){
  const tenant=await request('/api/tenants','POST',{name:'Railway controlled login lab'},null);state.tenantId=tenant.id;
  const source=await request('/api/sources','POST',{name:'railway-nginx-vps',scope:['nginx_access']});state.sourceId=source.id;
  run('bash',['config-Help/config.bash','prepare',source.id]);
  fs.writeFileSync(state.pki+'/client.ext','basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=clientAuth\n');
  run('openssl',['x509','-req','-in','/etc/waytrace/client.csr','-CA',state.pki+'/ca.crt','-CAkey',state.pki+'/ca.key','-CAcreateserial','-out',state.pki+'/client.crt','-days','2','-extfile',state.pki+'/client.ext']);
  const fingerprint=new X509Certificate(fs.readFileSync(state.pki+'/client.crt')).fingerprint256;
  await request('/api/sources/'+source.id+'/certificate','POST',{fingerprint});
  fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
 }
 const {createOnboardingPackage}=await import('../scripts/onboarding-package.mjs');
 state.bundleDir=stateDir+'/bundles/'+Date.now();
 await createOnboardingPackage({base:'http://127.0.0.1:8080',token:state.adminToken,tenant:state.tenantId,source:state.sourceId,caFile:state.pki+'/ca.crt',clientCertFile:state.pki+'/client.crt',outDir:state.bundleDir});
 fs.writeFileSync(stateDir+'/bundle-path',state.bundleDir+'\n',{mode:0o600});
 fs.mkdirSync('/var/log/nginx',{recursive:true});fs.closeSync(fs.openSync('/var/log/nginx/access.log','a',0o644));
 console.log(run('bash',['config-Help/config.bash','install',state.bundleDir,'--no-restart']).trim());
 fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
 child(process.execPath,['labs/login-site/server.mjs'],{LAB_USERNAME:state.username,LAB_PASSWORD:state.password});
 child('rsyslogd',['-n','-i','/run/waytrace-lab-rsyslog.pid']);
 run('nginx',['-t','-c',root+'/labs/login-site/nginx.conf']);
 child('nginx',['-c',root+'/labs/login-site/nginx.conf','-g','daemon off;']);
 await until(()=>fetch('http://127.0.0.1:8081/health').then(r=>r.ok));
 console.log('Login lab ready; credentials are in /var/lib/waytrace-lab/credentials.env. Only Nginx port 8081 is public.');
 await new Promise(()=>{});
}
async function stopLab(){
 if(!fs.existsSync(pidFile)){console.log('No managed lab supervisor PID.');return;}
 const pid=Number(fs.readFileSync(pidFile,'utf8'));if(!Number.isInteger(pid)||pid<2)throw new Error('Invalid lab PID');
 if(!fs.existsSync('/proc/'+pid)){fs.unlinkSync(pidFile);console.log('Stale lab PID removed.');return;}
 const cmd=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean);
 if(!cmd.some(a=>a.endsWith('labs/vps-lab.mjs'))||cmd.at(-1)!=='serve'||fs.readlinkSync(`/proc/${pid}/cwd`)!==root)throw new Error('PID does not belong to this lab; refusing to signal it');
 process.kill(pid,'SIGTERM');await until(()=>!fs.existsSync(pidFile)||!fs.existsSync('/proc/'+pid),35000);console.log('Lab stopped; provider evidence and local private key retained on sandbox disk.');
}
async function snapshotEvidence(){
 await stopLab();
 if(!state?.tenantId||!state.sourceId)throw new Error('No lab evidence identity');
 const verification=JSON.parse(run(process.execPath,['scripts/verify-evidence.mjs',state.tenantId,state.sourceId]).trim());
 // The snapshot command sets lab DATA_DIR; this subprocess reads no source .env.
 if(!verification.valid)throw new Error('Cannot snapshot invalid evidence');
 const archive=stateDir+'/evidence-backup.tgz';
 run('tar',['-czf',archive,'-C',stateDir,'data','test-result.json','linux-tests.txt','installer-tests.txt']);
 const metadata={captured_at:new Date().toISOString(),tenant_id:state.tenantId,source_id:state.sourceId,evidence_verification:verification,archive_sha256:createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),archive_bytes:fs.statSync(archive).size,includes:'Fresh lab database, queue, evidence and non-secret test outputs; excludes PKI/customer keys and credentials'};
 fs.writeFileSync(stateDir+'/evidence-backup.json',JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify(metadata,null,2));
}
async function testLab(){
 assert.ok(state?.sourceId,'Start the lab first');
 const base=process.env.LAB_PUBLIC_URL??'http://127.0.0.1:8081';
 const login=password=>fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:state.username,password})});
 const before=await request('/api/overview');
 assert.equal((await login(state.password)).status,200);
 for(let i=0;i<30;i++){assert.equal((await login('controlled-invalid-password-'+i)).status,401);await delay(30);}
 assert.equal((await login(state.password)).status,200);
 const overview=await until(async()=>{const totals=await request('/api/overview');return totals.totals.raw_evidence-before.totals.raw_evidence>=32?totals:false;});
 const findings=await until(async()=>{const rows=await request('/api/findings');return rows.some(f=>f.detector_id==='http-auth-denial')&&rows.some(f=>f.detector_id==='http-error-ratio')?rows:false;});
 const incidents=await until(async()=>{const rows=await request('/api/incidents');return rows.length?rows:false;});
 const report=await request('/api/incidents/'+incidents[0].incident_id+'/report');
 const evidence=await request('/api/evidence/verify');
 assert.equal(evidence.valid,true);assert.equal(incidents[0].confidence,null);assert.ok(report.evidence.length>=20);
 assert.ok(overview.totals.raw_evidence-before.totals.raw_evidence>=32);
 const outsider=await request('/api/tenants','POST',{name:'Isolation check '+Date.now()},null);
 const isolated=await request('/api/evidence','GET',undefined,outsider.id);assert.deepEqual(isolated,[]);
 const leak=await fetch('http://127.0.0.1:8080/api/incidents/'+incidents[0].incident_id+'/report?tenant_id='+outsider.id,{headers:{Authorization:'Bearer '+state.adminToken}});assert.equal(leak.status,404);
 const raw=fs.readFileSync('/var/log/nginx/access.log','utf8');assert.ok(!raw.includes(state.password));assert.ok(!raw.includes('controlled-invalid-password'));
 assert.ok(findings.every(f=>f.confidence===null));
 const feed=await request('/api/wayfox/feed');assert.ok(feed.items.length);
 const result={passed:true,occurred_at:new Date().toISOString(),traffic:{successful_logins:2,failed_logins:30},tenant_id:state.tenantId,source_id:state.sourceId,new_raw_evidence:overview.totals.raw_evidence-before.totals.raw_evidence,total_observations:overview.totals.observations,detectors:findings.map(f=>f.detector_id),incidents:incidents.length,incident_id:incidents[0].incident_id,risk:incidents[0].risk,confidence:incidents[0].confidence,report_evidence_count:report.evidence.length,evidence_verification:evidence,cross_tenant_read:'404 / empty list',passwords_in_access_log:false,collection:'Nginx → file → installed rsyslog imfile → GnuTLS mTLS → WayTrace',limitation:'Provider and customer processes share this lab VM; mTLS uses loopback, not an external VPS network.'};
 fs.writeFileSync(stateDir+'/test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
if(mode==='serve')await serve().catch(async e=>{console.error(e.message);await shutdown(1);});else if(mode==='test')await testLab();else if(mode==='stop')await stopLab();else if(mode==='snapshot'){process.env.DATA_DIR=stateDir+'/data';await snapshotEvidence();}else throw new Error('Usage: node labs/vps-lab.mjs serve|test|stop|snapshot');
