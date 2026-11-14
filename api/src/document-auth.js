const enc=new TextEncoder();
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export async function hashDocumentPassword(password,salt=encode(crypto.getRandomValues(new Uint8Array(16)))) {
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const hash=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(salt),iterations:100000},key,256);
  return {salt,password_hash:encode(hash)};
}
function equal(a,b){let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0;}
async function sign(text,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return encode(await crypto.subtle.sign('HMAC',key,enc.encode(text)));}
export async function issueDocumentToken(env,version){const exp=Math.floor(Date.now()/1000)+7*86400;const body=`docs.${exp}.${version}`;return body+'.'+await sign(body,env.SESSION_SECRET);}
export async function documentSession(request,env){
  if(!env.SESSION_SECRET)return false;
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  const [aud,expiry,version,sig,extra]=token.split('.');
  if(aud!=='docs'||extra||!/^\d{10,12}$/.test(expiry||'')||Number(expiry)<=Date.now()/1000||!/^[a-f0-9-]{36}$/.test(version||''))return false;
  const row=await env.DB.prepare('SELECT version FROM document_access WHERE id=1').first();
  if(!row||row.version!==version)return false;
  return equal(sig||'',await sign(`${aud}.${expiry}.${version}`,env.SESSION_SECRET));
}
export async function documentLogin(request,env,body){
  if(!env.SESSION_SECRET)return {status:503,error:'L’accès Documents n’est pas configuré.'};
  const row=await env.DB.prepare('SELECT salt,password_hash,version FROM document_access WHERE id=1').first();
  if(!row)return {status:503,error:'Le mot de passe Documents doit être défini dans Admin.'};
  const ip=encode(await crypto.subtle.digest('SHA-256',enc.encode(request.headers.get('cf-connecting-ip')||'unknown')));
  const now=Math.floor(Date.now()/1000),key='documents:'+ip;
  const rate=await env.DB.prepare(`INSERT INTO login_attempts(ip_hash,window_started,attempts) VALUES(?,?,1)
    ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN window_started<? THEN 1 ELSE attempts+1 END,
    window_started=CASE WHEN window_started<? THEN excluded.window_started ELSE window_started END RETURNING attempts`).bind(key,now,now-900,now-900).first();
  if(rate.attempts>8)return {status:429,error:'Trop d’essais. Réessaie dans quinze minutes.'};
  if(typeof body.password!=='string'||body.password.length>200||!equal((await hashDocumentPassword(body.password,row.salt)).password_hash,row.password_hash))return {status:401,error:'Mot de passe de classe incorrect.'};
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(key).run();
  return {token:await issueDocumentToken(env,row.version),expires_in:7*86400};
}
export async function changeDocumentPassword(env,password){
  if(typeof password!=='string'||password.length<10||password.length>200)throw new Error('Mot de passe Documents invalide : entre 10 et 200 caractères.');
  const {salt,password_hash}=await hashDocumentPassword(password);
  await env.DB.prepare(`INSERT INTO document_access(id,salt,password_hash,version,updated_at) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,version=excluded.version,updated_at=excluded.updated_at`)
    .bind(salt,password_hash,crypto.randomUUID(),new Date().toISOString()).run();
  return {ok:true};
}
let githubKeys=null,keysUntil=0;
export async function collectorSession(request){
  try{
    const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
    if(token.length>16000)return false;
    const [h,p,s,extra]=token.split('.');if(extra||!h||!p||!s)return false;
    const header=JSON.parse(new TextDecoder().decode(decode(h))),claims=JSON.parse(new TextDecoder().decode(decode(p)));
    const now=Date.now()/1000;
    if(header.alg!=='RS256'||![claims.exp,claims.nbf,claims.iat].every(Number.isFinite)||claims.iss!=='https://token.actions.githubusercontent.com'||claims.aud!=='collo-document-catalogue'||claims.exp<=now||claims.nbf>now+30||claims.iat<now-600||claims.iat>now+30||claims.exp>now+600||claims.sub!=='repo:knsrhuseyin/cahier-de-prepa-sync:ref:refs/heads/main'||claims.repository!=='knsrhuseyin/cahier-de-prepa-sync'||claims.workflow_ref!=='knsrhuseyin/cahier-de-prepa-sync/.github/workflows/sync.yml@refs/heads/main'||claims.ref!=='refs/heads/main')return false;
    if(!githubKeys||keysUntil<Date.now()){
      const response=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks',{signal:AbortSignal.timeout(10000)});
      if(!response.ok)return false;githubKeys=(await response.json()).keys;keysUntil=Date.now()+300000;
    }
    const jwk=githubKeys.find(k=>k.kid===header.kid);if(!jwk)return false;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(s),enc.encode(h+'.'+p));
  }catch{return false;}
}
