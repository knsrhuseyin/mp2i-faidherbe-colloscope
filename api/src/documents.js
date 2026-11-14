import { documentSession, documentLogin, changeDocumentPassword, collectorSession } from './document-auth.js';
import {ensureDocumentUpdates} from './document-store.js';
import {discordSettings,saveDiscord,testDiscord} from './document-discord.js';
const SOURCE_NAMES={maths:'Mathématiques',english:'Anglais',physics:'Physique'};
const fold=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const uuid=()=>crypto.randomUUID();
async function body(request){
  const reader=request.body?.getReader();const chunks=[];let size=0;
  if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>512000){await reader.cancel();throw new Error('Requête Documents trop volumineuse');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new Error('JSON Documents invalide');}
}
export function sourceRoot(id,value){
  if(!Object.hasOwn(SOURCE_NAMES,id))throw new Error('Source Documents inconnue');
  let url;try{url=new URL(value);}catch{throw new Error('Adresse de source invalide');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw new Error('Adresse de source invalide');
  if(id==='physics'){
    if(url.hostname!=='nuage13.apps.education.fr'||!/^\/index.php\/s\/[A-Za-z0-9]{10,40}\/?$/.test(url.pathname))throw new Error('Lien Nuage invalide');
    return url.origin+url.pathname.replace(/\/$/,'');
  }
  if(url.hostname!=='drive.google.com'||!/^\/drive\/folders\/[A-Za-z0-9_-]{10,100}$/.test(url.pathname))throw new Error('Lien de dossier Drive invalide');
  return url.origin+url.pathname;
}
export function documentUrl(source,value){
  let u;try{u=new URL(value);}catch{throw new Error('Lien de document invalide');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||value.length>5000)throw new Error('Lien de document invalide');
  if(source.id==='physics'){
    const root=new URL(source.root_url);
    if(u.origin!==root.origin||![root.pathname,root.pathname+'/download'].includes(u.pathname))throw new Error('Lien Nuage hors de la source');
  }else{
    const drive=u.hostname==='drive.google.com'&&/^\/(?:file\/d\/[A-Za-z0-9_-]{10,100}\/view|drive\/folders\/[A-Za-z0-9_-]{10,100})\/?$/.test(u.pathname);
    const docs=u.hostname==='docs.google.com'&&/^\/(?:document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]{10,100}\/[^/]*$/.test(u.pathname);
    const maths=source.id==='maths'&&u.hostname==='cahier-de-prepa.fr'&&u.pathname==='/mp2i-faidherbe/download'&&/^\d{1,12}$/.test(u.searchParams.get('id')||'')&&[...u.searchParams.keys()].every(k=>k==='id');
    if(!drive&&!docs&&!maths)throw new Error('Lien Documents hors du périmètre autorisé');
  }
  return u.href;
}
function cleanItem(source,item){
  if(!item||typeof item.id!=='string'||!item.id||item.id.length>200||typeof item.parent_id!=='string'||item.parent_id.length>200||!['file','folder'].includes(item.kind)||typeof item.name!=='string'||!item.name.trim()||item.name.length>300||typeof item.path!=='string'||item.path.length>2000)throw new Error('Métadonnées Documents invalides');
  const size=item.size==null?null:Number(item.size);if(size!==null&&(!Number.isSafeInteger(size)||size<0))throw new Error('Taille de document invalide');
  const modified=item.modified_at==null?null:String(item.modified_at);if(modified!==null&&(modified.length>80||Number.isNaN(Date.parse(modified))))throw new Error('Date de document invalide');
  if(item.published_at!=null&&(typeof item.published_at!=='string'||item.published_at.length>80||Number.isNaN(Date.parse(item.published_at))))throw new Error('Date de publication invalide');
  const published=item.published_at==null?null:new Date(item.published_at).toISOString();
  return {...item,published_at:published,name:item.name.trim(),url:documentUrl(source,item.url),mime:String(item.mime||'application/octet-stream').slice(0,150),size,modified_at:modified===null?null:new Date(modified).toISOString()};
}
async function sources(env,admin=false){
  const rows=(await env.DB.prepare('SELECT * FROM document_sources ORDER BY label').all()).results;
  return rows.map(s=>({id:s.id,label:s.label,kind:s.kind,synced_at:s.synced_at,attempted_at:s.attempted_at,error:s.error,item_count:s.item_count,
    url:s.id==='maths'?'https://cahier-de-prepa.fr/mp2i-faidherbe/':s.root_url,
    ...(admin?{root_url:s.root_url,revision:s.revision}:{}),}));
}
async function ingest(env,input){
  const source=await env.DB.prepare('SELECT * FROM document_sources WHERE id=?').bind(input.source).first();
  if(!source||source.revision!==input.revision)return {status:409,error:'La source a changé. Relance la synchronisation.'};
  if(typeof input.generation!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(input.generation)||!Array.isArray(input.items)||input.items.length>20)throw new Error('Lot Documents invalide');
  const items=input.items.map(item=>cleanItem(source,item));
  const now=new Date().toISOString();
  if(items.length){
    await env.DB.batch(items.flatMap(i=>[env.DB.prepare(`INSERT INTO document_items(source_id,generation,id,parent_id,name,kind,mime,size,modified_at,url,path,search_text)
      VALUES(?,?,?,?,?,?,?,?,?,COALESCE((SELECT url FROM document_items WHERE source_id=? AND generation=? AND id=? AND ?=1 AND url LIKE 'https://cahier-de-prepa.fr/mp2i-faidherbe/download?id=%'),?),?,?) ON CONFLICT(source_id,generation,id) DO UPDATE SET parent_id=excluded.parent_id,name=excluded.name,kind=excluded.kind,mime=excluded.mime,size=excluded.size,modified_at=excluded.modified_at,url=excluded.url,path=excluded.path,search_text=excluded.search_text`)
      .bind(source.id,input.generation,i.id,i.parent_id,i.name,i.kind,i.mime,i.size,i.modified_at,source.id,source.generation,i.id,source.id==='maths'&&i.kind==='file'&&new URL(i.url).hostname==='drive.google.com'?1:0,i.url,i.path,fold(i.name+' '+i.path)),
      env.DB.prepare('INSERT INTO document_dates(source_id,generation,item_id,published_at) VALUES(?,?,?,COALESCE(?,(SELECT published_at FROM document_dates WHERE source_id=? AND generation=? AND item_id=?))) ON CONFLICT(source_id,generation,item_id) DO UPDATE SET published_at=COALESCE(excluded.published_at,document_dates.published_at)').bind(source.id,input.generation,i.id,i.published_at,source.id,source.generation,i.id)]));
  }
  if(input.complete===true){
    if(!Number.isInteger(input.expected_count)||input.expected_count<0||input.expected_count>5000)throw new Error('Nombre de documents invalide');
    const total=await env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN kind='file' THEN 1 ELSE 0 END) AS files FROM document_items WHERE source_id=? AND generation=?").bind(source.id,input.generation).first();
    if(total.total!==input.expected_count)return {status:409,error:'Catalogue incomplet : publication refusée.'};
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO document_announcements(source_id,revision,item_id,created_at)
        SELECT i.source_id,s.revision,i.id,? FROM document_items i JOIN document_sources s ON s.id=i.source_id
        JOIN document_discord d ON d.source_id=s.id AND d.enabled=1
        WHERE i.source_id=? AND i.generation=? AND s.revision=? AND s.synced_at IS NOT NULL AND i.kind='file'
        AND NOT EXISTS(SELECT 1 FROM document_seen v WHERE v.source_id=s.id AND v.revision=s.revision AND v.item_id=i.id)`).bind(now,source.id,input.generation,input.revision),
      env.DB.prepare(`INSERT OR IGNORE INTO document_seen(source_id,revision,item_id,first_seen_at)
        SELECT i.source_id,s.revision,i.id,CASE WHEN s.synced_at IS NULL THEN NULL ELSE ? END FROM document_items i JOIN document_sources s ON s.id=i.source_id
        WHERE i.source_id=? AND i.generation=? AND s.revision=?`).bind(now,source.id,input.generation,input.revision),
      env.DB.prepare('UPDATE document_sources SET generation=?,synced_at=?,attempted_at=?,error=NULL,item_count=? WHERE id=? AND revision=?').bind(input.generation,now,now,total.files||0,source.id,input.revision),
      env.DB.prepare('DELETE FROM document_items WHERE source_id=? AND generation<>? AND EXISTS(SELECT 1 FROM document_sources WHERE id=? AND generation=? AND revision=?)').bind(source.id,input.generation,source.id,input.generation,input.revision),
      env.DB.prepare('DELETE FROM document_dates WHERE source_id=? AND generation<>? AND EXISTS(SELECT 1 FROM document_sources WHERE id=? AND generation=? AND revision=?)').bind(source.id,input.generation,source.id,input.generation,input.revision),
    ]);
  }
  return {ok:true};
}
async function listDocuments(env,url){
  const source=url.searchParams.get('source')||'',parent=url.searchParams.get('parent')||'',query=(url.searchParams.get('q')||'').trim().slice(0,120);
  if(source&&!Object.hasOwn(SOURCE_NAMES,source))throw new Error('Matière Documents inconnue');
  if(parent.length>200||(!source&&parent))throw new Error('Dossier Documents invalide');
  const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
  const args=[],where=['i.generation=s.generation'];
  if(source){where.push('i.source_id=?');args.push(source);}
  if(query){where.push("i.search_text LIKE ? ESCAPE '\\'");args.push('%'+fold(query).replace(/[\\%_]/g,'\\$&')+'%');}
  else if(source){where.push('i.parent_id=?');args.push(parent);}
  else where.push("i.kind='file'");
  const condition=where.join(' AND ');
  const total=await env.DB.prepare(`SELECT COUNT(*) AS total FROM document_items i JOIN document_sources s ON s.id=i.source_id WHERE ${condition}`).bind(...args).first();
  const result=await env.DB.prepare(`SELECT i.id,i.source_id,i.parent_id,i.name,i.kind,i.mime,i.size,i.modified_at,i.url,i.path,d.published_at,v.first_seen_at,
    COALESCE(v.first_seen_at,d.published_at,CASE WHEN s.id<>'maths' THEN i.modified_at END) AS recent_at,
    CASE WHEN v.first_seen_at IS NOT NULL THEN 'detected' WHEN d.published_at IS NOT NULL THEN 'published' WHEN s.id<>'maths' AND i.modified_at IS NOT NULL THEN 'modified' ELSE 'unknown' END AS date_kind
    FROM document_items i JOIN document_sources s ON s.id=i.source_id
    LEFT JOIN document_dates d ON d.source_id=i.source_id AND d.generation=i.generation AND d.item_id=i.id
    LEFT JOIN document_seen v ON v.source_id=i.source_id AND v.revision=s.revision AND v.item_id=i.id
    WHERE ${condition} ORDER BY CASE WHEN i.kind='folder' THEN 0 ELSE 1 END,julianday(COALESCE(v.first_seen_at,d.published_at,CASE WHEN s.id<>'maths' THEN i.modified_at END)) DESC,i.name COLLATE NOCASE,i.source_id,i.id LIMIT 50 OFFSET ?`).bind(...args,Math.floor(offset)).all();
  const crumbs=[];let current=parent;const seen=new Set();
  while(current&&crumbs.length<20&&!seen.has(current)){
    seen.add(current);
    const row=await env.DB.prepare('SELECT i.id,i.name,i.parent_id FROM document_items i JOIN document_sources s ON s.id=i.source_id WHERE i.source_id=? AND i.generation=s.generation AND i.id=? AND i.kind=\'folder\'').bind(source,current).first();
    if(!row)return {status:404,error:'Ce dossier a changé. Reviens à la racine de la matière.'};
    crumbs.unshift({id:row.id,name:row.name});current=row.parent_id;
  }
  return {items:result.results,total:total.total,offset:Math.floor(offset),limit:50,breadcrumbs:crumbs};
}
export async function documentRoute(request,env,admin=false){
  await ensureDocumentUpdates(env);
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/documents/login'&&method==='POST')return documentLogin(request,env,await body(request));
  if(path==='/api/documents/session'&&method==='GET')return {authenticated:admin||await documentSession(request,env)};
  if(['/api/documents/collector-config','/api/documents/ingest','/api/documents/collector-error'].includes(path)){
    if(!await collectorSession(request))return {status:401,error:'Collecteur non autorisé.'};
    if(path.endsWith('collector-config')&&method==='GET')return {sources:await sources(env,true),discord:await discordSettings(env)};
    if(path.endsWith('/ingest')&&method==='POST')return ingest(env,await body(request));
    if(path.endsWith('collector-error')&&method==='POST'){
      const input=await body(request);
      await env.DB.prepare('UPDATE document_sources SET attempted_at=?,error=? WHERE id=? AND revision=?').bind(new Date().toISOString(),'Synchronisation indisponible. Le dernier catalogue est conservé.',input.source,input.revision).run();
      return {ok:true};
    }
    return {status:405,error:'Méthode refusée.'};
  }
  if(path.startsWith('/api/admin/documents')){
    if(!admin)return {status:401,error:'Session administrateur requise.'};
    if(path==='/api/admin/documents'&&method==='GET'){
      const access=await env.DB.prepare('SELECT updated_at FROM document_access WHERE id=1').first();
      return {password_configured:!!access,password_updated_at:access?.updated_at||null,sources:await sources(env,true),discord:await discordSettings(env)};
    }
    if(path==='/api/admin/documents/discord'&&method==='POST')return saveDiscord(env,await body(request));
    if(path==='/api/admin/documents/discord/test'&&method==='POST')return testDiscord(env,(await body(request)).id);
    if(path==='/api/admin/documents/password'&&method==='POST')return changeDocumentPassword(env,(await body(request)).password);
    if(path==='/api/admin/documents/source'&&method==='POST'){
      const input=await body(request),root=sourceRoot(input.id,input.root_url),revision=uuid();
      const old=await env.DB.prepare('SELECT root_url FROM document_sources WHERE id=?').bind(input.id).first();
      if(old?.root_url===root)return {ok:true};
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO document_sources(id,label,kind,root_url,revision) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET root_url=excluded.root_url,revision=excluded.revision,generation='',synced_at=NULL,error=NULL,item_count=0`).bind(input.id,SOURCE_NAMES[input.id],input.id==='physics'?'webdav':'drive',root,revision),
        env.DB.prepare('DELETE FROM document_items WHERE source_id=?').bind(input.id),
        env.DB.prepare('DELETE FROM document_dates WHERE source_id=?').bind(input.id),
        env.DB.prepare('DELETE FROM document_seen WHERE source_id=?').bind(input.id),
        env.DB.prepare('DELETE FROM document_announcements WHERE source_id=?').bind(input.id),
      ]);
      return {ok:true};
    }
    return {status:404,error:'Route Documents introuvable.'};
  }
  if(!admin&&!await documentSession(request,env))return {status:401,error:'Connecte-toi avec le mot de passe de classe.'};
  if(path==='/api/documents/sources'&&method==='GET')return {sources:await sources(env)};
  if(path==='/api/documents/items'&&method==='GET')return listDocuments(env,url);
  return {status:404,error:'Route Documents introuvable.'};
}
