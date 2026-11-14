import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { THEMES } from '../front/theme-core.mjs';
import { themeIconSvg } from '../front/icon-art.mjs';
import { createManifest, iconPath } from '../front/manifest-core.mjs';
import { onRequestGet as manifest } from '../front/functions/manifest.webmanifest.js';
import { onRequestGet as customIcon } from '../front/functions/icons/custom.png.js';
const origin='https://collo.test';
for(const t of THEMES){
 const svg=themeIconSvg(t); assert.ok(svg.includes('HX1'));assert.ok(svg.includes('67'));
 assert.ok(!/<script|foreignObject|https?:\/\/(?!www.w3.org)/.test(svg));
 const m=createManifest(t,origin);
 assert.equal(m.id,origin+'/');assert.equal(m.scope,origin+'/');assert.equal(m.start_url,origin+'/');
 assert.deepEqual(m.icons.map(i=>i.sizes),['192x192','512x512']);
 assert.ok(m.icons.every(i=>i.src.startsWith(origin+'/icons/themes/'+t.id)));
 assert.equal(m.theme_color,t.colors.paper);
}
const custom={...structuredClone(THEMES[6]),id:'custom-winter',name:'Winter <&"'};
const svg=themeIconSvg(custom);assert.ok(svg.includes('&lt;&amp;&quot;'));
for(const size of [192,512]){
 const url=new URL(iconPath(custom,size),origin+'/');
 const response=await customIcon({request:new Request(url)});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
 const png=Buffer.from(await response.arrayBuffer());assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 const data=[];let offset=8;
 while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')data.push(png.subarray(offset+8,offset+8+length));offset+=12+length;}
 const rows=inflateSync(Buffer.concat(data));assert.equal(rows.length,(size*4+1)*size);
 const expected=[7,29,39,255];assert.deepEqual([...rows.subarray(1,5)],expected);
}
for(const path of ['/icons/custom.png?size=9000','/icons/custom.png?size=192&lime=red','/icons/custom.png?size=512']) assert.equal((await customIcon({request:new Request(origin+path)})).status,400);
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({data:{appearance:{default_theme:'christmas',custom_themes:[],periods:[]}}}),{headers:{'content-type':'application/json'}});
const response=await manifest({request:new Request(origin+'/manifest.webmanifest'),env:{}});
assert.equal(response.headers.get('cache-control'),'no-store');assert.ok((await response.json()).icons[0].src.includes('/christmas-192.png'));
globalThis.fetch=async()=>{throw new Error('Offline')};
assert.ok((await (await manifest({request:new Request(origin+'/manifest.webmanifest'),env:{}})).json()).icons[0].src.includes('/midnight-192.png'));
globalThis.fetch=originalFetch;
console.log('Icon tests passed: HX1/67 artwork, stable app identity, themed manifests, custom PNG generation, validation and network fallback.');
