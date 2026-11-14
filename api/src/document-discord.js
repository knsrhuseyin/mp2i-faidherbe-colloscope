import {ensureDocumentUpdates} from './document-store.js';
const subjects={english:'Anglais',physics:'Physique'};
const enc=new TextEncoder();
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function webhookUrl(value){
  if(typeof value!=='string'||value.length>400)throw new Error('Webhook Discord invalide');
  let url;try{url=new URL(value);}catch{throw new Error('Webhook Discord invalide');}
  if(url.protocol!=='https:'||url.hostname!=='discord.com'||url.port||url.username||url.password||url.search||url.hash||!/^\/api\/webhooks\/\d{15,25}\/[A-Za-z0-9._-]{30,200}$/.test(url.pathname))throw new Error('Webhook Discord invalide');
  return url.href;
}
async function key(env){if(!env.SESSION_SECRET)throw new Error('Configuration Discord indisponible');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode('collo-discord-v1:'+env.SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(env,source,value){const iv=crypto.getRandomValues(new Uint8Array(12));return encode(iv)+'.'+encode(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(source)},await key(env),enc.encode(value)));}
async function unseal(env,source,value){const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:enc.encode(source)},await key(env),decode(data)));}
export async function discordSettings(env){
  const rows=(await env.DB.prepare('SELECT d.source_id,d.enabled,d.updated_at,d.last_sent_at,d.last_error,(SELECT COUNT(*) FROM document_announcements a WHERE a.source_id=d.source_id AND a.state='uncertain') AS uncertain FROM document_discord d').all()).results;
  return Object.entries(subjects).map(([id,label])=>{const row=rows.find(r=>r.source_id===id);return {id,label,configured:!!row,enabled:!!row?.enabled,last_sent_at:row?.last_sent_at||null,error:row?.uncertain?row.uncertain+' envoi(s) sans confirmation. Vérifie le salon Discord pour éviter un doublon.':row?.last_error||null};});
}
export async function saveDiscord(env,input){
  if(!Object.hasOwn(subjects,input.id)||typeof input.enabled!=='boolean')throw new Error('Paramètres Discord invalides');
  const existing=await env.DB.prepare('SELECT * FROM document_discord WHERE source_id=?').bind(input.id).first();
  const value=typeof input.webhook==='string'?input.webhook.trim():'';
  if(input.remove===true){await env.DB.batch([env.DB.prepare('DELETE FROM document_discord WHERE source_id=?').bind(input.id),env.DB.prepare("UPDATE document_announcements SET state='cancelled' WHERE source_id=? AND state IN ('pending','retry')").bind(input.id)]);return {ok:true};}
  if(!value&&!existing)throw new Error('URL du webhook Discord manquante');
  const encrypted=value?await seal(env,input.id,webhookUrl(value)):existing.webhook;
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO document_discord(source_id,webhook,enabled,updated_at) VALUES(?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET webhook=excluded.webhook,enabled=excluded.enabled,updated_at=excluded.updated_at,last_error=NULL`).bind(input.id,encrypted,input.enabled?1:0,now),
    // A newly enabled/replaced destination starts with future discoveries, not its backlog.
    ...((value||!input.enabled||!existing?.enabled)?[env.DB.prepare("UPDATE document_announcements SET state='cancelled' WHERE source_id=? AND state IN ('pending','retry')").bind(input.id)]:[])
  ]);
  return {ok:true};
}
const escaped=(text,limit)=>String(text).replace(/[\x00-\x1f\x7f]/g,' ').replace(/([\\`*_{}\[\]()~|>])/g,'\\$1').slice(0,limit);
export function announcementPayload(item){
  return {allowed_mentions:{parse:[]},embeds:[{title:'📚 Nouveau fichier · '+subjects[item.source_id],color:item.source_id==='english'?0x9b59b6:0xe67e22,description:escaped(item.name,1000),url:item.url,fields:[{name:'Dossier',value:escaped(item.path||'Racine',1000)},{name:'Ouvrir',value:'[Consulter le fichier]('+item.url.replace(/\(/g,'%28').replace(/\)/g,'%29')+')'}],footer:{text:'Collo · HX1 · 67'},timestamp:item.created_at}]};
}
async function send(env,source,encrypted,payload){
  let response;
  try{
    const url=webhookUrl(await unseal(env,source,encrypted))+'?wait=true';
    response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
    await response.body?.cancel();
    if(response.status===200||response.status===204)return {state:'sent',error:null};
    if(response.status===429){const delay=Number(response.headers.get('retry-after'));return {state:'retry',delay:Number.isFinite(delay)?Math.min(3600,Math.max(60,delay))*1000:60000,error:'Discord limite les envois. Nouvelle tentative prévue.'};}
    if(response.status>=500)return {state:'uncertain',error:'Discord a renvoyé une erreur. Envoi incertain : vérifier le salon avant de réessayer.'};
    return {state:'retry',delay:600000,error:'Discord a refusé le webhook (HTTP '+response.status+'). Vérifie son URL et ses permissions.'};
  }catch{return {state:'uncertain',error:'Réponse Discord inconnue. Vérifie le salon avant de réessayer pour éviter un doublon.'};}
}
export async function testDiscord(env,id){
  if(!Object.hasOwn(subjects,id))throw new Error('Matière Discord inconnue');
  const row=await env.DB.prepare('SELECT webhook FROM document_discord WHERE source_id=?').bind(id).first();
  if(!row)return {status:400,error:'Enregistre le webhook de cette matière avant le test.'};
  const result=await send(env,id,row.webhook,{allowed_mentions:{parse:[]},embeds:[{title:'✅ Collo · '+subjects[id],description:'Le salon est prêt pour les nouveaux fichiers. Vérification des sources toutes les dix minutes environ.',color:0x2ecc71,footer:{text:'HX1 · 67'}}]});
  await env.DB.prepare('UPDATE document_discord SET last_error=? WHERE source_id=?').bind(result.error,id).run();
  return result.state==='sent'?{ok:true}:{status:502,error:result.error};
}
export async function dispatchDocumentAnnouncements(env,now=Date.now()){
  await ensureDocumentUpdates(env);
  // Never blindly retry an expired request whose delivery may have succeeded.
  await env.DB.prepare("UPDATE document_announcements SET state='uncertain' WHERE state='sending' AND lease_until<?").bind(now).run();
  const rows=(await env.DB.prepare(`SELECT a.*,i.name,i.path,i.url,d.webhook FROM document_announcements a
    JOIN document_sources s ON s.id=a.source_id AND s.revision=a.revision
    JOIN document_items i ON i.source_id=s.id AND i.generation=s.generation AND i.id=a.item_id
    JOIN document_discord d ON d.source_id=a.source_id AND d.enabled=1
    WHERE a.state IN ('pending','retry') AND a.next_attempt<=? ORDER BY a.created_at,a.item_id LIMIT 10`).bind(now).all()).results;
  for(const row of rows){
    const claim=await env.DB.prepare("UPDATE document_announcements SET state='sending',lease_until=?,attempts=attempts+1 WHERE source_id=? AND revision=? AND item_id=? AND state IN ('pending','retry') AND next_attempt<=?").bind(now+120000,row.source_id,row.revision,row.item_id,now).run();
    if(!claim.meta.changes)continue;
    const result=await send(env,row.source_id,row.webhook,announcementPayload(row));
    const sent=result.state==='sent'?new Date(now).toISOString():null;
    await env.DB.batch([
      env.DB.prepare("UPDATE document_announcements SET state=?,sent_at=?,next_attempt=? WHERE source_id=? AND revision=? AND item_id=? AND state='sending'").bind(result.state,sent,now+(result.delay||600000),row.source_id,row.revision,row.item_id),
      env.DB.prepare('UPDATE document_discord SET last_sent_at=COALESCE(?,last_sent_at),last_error=? WHERE source_id=?').bind(sent,result.error,row.source_id)
    ]);
  }
}
