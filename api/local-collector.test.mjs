import assert from 'node:assert/strict';
import {collectorSession,localCollectorSession} from './src/document-auth.js';
const enc=new TextEncoder();
const env={LOCAL_COLLECTOR_SECRET:'fictional-local-collector-secret-never-deployed'};
const route='/api/documents/ingest';
async function signed({path=route,body='{"source":"maths","items":[]}',method='POST',expiry=Math.floor(Date.now()/1000)+90,secret=env.LOCAL_COLLECTOR_SECRET}={}){
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(body))),b=>b.toString(16).padStart(2,'0')).join('');
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,enc.encode([method,path,expiry,digest].join('\n')))).toString('base64url');
 return new Request('https://api.test'+path,{method,headers:{authorization:`Bearer local.${expiry}.${digest}.${sig}`},...(method==='POST'?{body}: {})});
}
assert.equal(await collectorSession(await signed(),env),true);
assert.equal(await localCollectorSession(await signed(),{}),false);
assert.equal(await collectorSession(await signed({secret:'wrong'}),env),false);
assert.equal(await collectorSession(await signed({expiry:Math.floor(Date.now()/1000)-1}),env),false);
assert.equal(await collectorSession(await signed({expiry:Math.floor(Date.now()/1000)+3600}),env),false);
for(const path of ['/api/admin/colloscope','/api/admin/documents','/api/push/subscribe'])assert.equal(await localCollectorSession(await signed({path}),env),false);
const original=await signed();
assert.equal(await collectorSession(new Request(original.url,{method:'POST',headers:original.headers,body:'{"source":"physics"}'}),env),false);
const get=await signed({path:'/api/documents/collector-config',method:'GET',body:''});
assert.equal(await collectorSession(get,env),true);
assert.equal(await collectorSession(await signed({body:'x'.repeat(2_000_001)}),env),false);
console.log('Local collector identity verified: scoped routes, body binding, expiry, key, size and admin isolation.');
