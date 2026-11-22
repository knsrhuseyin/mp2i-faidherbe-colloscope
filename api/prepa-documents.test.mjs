import assert from 'node:assert/strict';
import {prepaDocuments} from './src/prepa-documents.js';
const env={PREPA_SYNC_DOCUMENTS_KEY:'f'.repeat(43),PREPA_SYNC_SITE_TOKEN:'fixture-platform'};
const request=(path,token,method='GET')=>new Request('https://api.test'+path,{method,headers:token?{authorization:'Bearer '+token}:{}});
let calls=0;const upstream=async(url,options)=>{calls++;assert.equal(url,'https://prepa-sync-huseyin.huseyinkenesari20081.chatgpt.site/api/integrations/collo/documents');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,'Bearer '+'f'.repeat(43));return Response.json({schema:1,provider:'prepa-sync',documents:[{id:'file',name:'Cours.pdf',subject:'maths'}],updated_at:'2026-11-22T10:00:00Z'});};
assert.equal((await prepaDocuments(request('/api/documents/catalogue'),env,upstream)).status,401);
assert.equal((await prepaDocuments(request('/api/documents/catalogue','wrong'),env,upstream)).status,401);assert.equal(calls,0);
assert.equal((await prepaDocuments(request('/api/documents/catalogue','f'.repeat(43),'POST'),env,upstream)).status,405);
assert.equal((await prepaDocuments(request('/api/documents/catalogue','f'.repeat(43)),env,upstream)).documents[0].name,'Cours.pdf');
assert.equal((await prepaDocuments(request('/api/documents/collector-config','f'.repeat(43)),env,upstream)),null);
for(const response of [new Response('secret upstream html',{status:403}),new Response('',{status:302,headers:{location:'https://evil.test'}}),Response.json({invalid:'secret'})]){const value=await prepaDocuments(request('/api/documents/catalogue','f'.repeat(43)),env,async()=>response);assert.equal(value.status,503);assert.equal(JSON.stringify(value).includes('secret'),false);}
assert.equal((await prepaDocuments(request('/api/documents/catalogue','f'.repeat(43)),env,async()=>new Response('x'.repeat(2000001)))).status,503);
assert.equal((await prepaDocuments(request('/api/documents/catalogue','g'.repeat(43)),env,async()=>new Response('',{status:401}))).status,401);
assert.equal((await prepaDocuments(request('/api/documents/access','f'.repeat(43)),env,upstream)).authenticated,true);
console.log('Read-only proxy verified: key isolation, fixed URL, bounded replies, redirects and sanitized errors.');
