import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import * as webauthn from '@simplewebauthn/server';
export const digest=s=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
export const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
export class Auth {
 constructor(db,config,services=[],adapter=webauthn){this.db=db;this.config=config;this.adapter=adapter;this.services=services;
  if(!Array.isArray(services)||services.some(s=>typeof s.id!=='string'||!/^[a-f0-9]{64}$/.test(s.tokenHash)||!Array.isArray(s.scopes)||s.scopes.some(x=>!['board:read','board:write'].includes(x))||!Number.isSafeInteger(s.expires)))throw Error('Invalid service principal configuration');
 }
 prune(){const now=Date.now();this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);this.db.prepare('DELETE FROM challenges WHERE expires<=?').run(now);}
 challenge(kind,value){this.prune();if(this.db.prepare('SELECT count(*) n FROM challenges').get().n>=100)throw Error('Too many authentication attempts');const id=secret();this.db.prepare('INSERT INTO challenges VALUES(?,?,?,?)').run(digest(id),kind,value,Date.now()+300000);return id;}
 consume(id,kind){const row=this.db.prepare('DELETE FROM challenges WHERE digest=? RETURNING *').get(digest(String(id||'')));if(!row||row.kind!==kind||row.expires<=Date.now())throw Error('Invalid challenge');return row.challenge;}
 enrollAllowed(token){return this.config.enrollmentToken&&equal(token,this.config.enrollmentToken)&&this.db.prepare('SELECT count(*) n FROM passkeys').get().n===0;}
 async options(kind,token){
  if(kind==='register'&&!this.enrollAllowed(token))throw Error('Enrollment unavailable');
  const options=kind==='register'?await this.adapter.generateRegistrationOptions({rpName:'Hibou Board',rpID:this.config.rpID,userName:'Owner',attestationType:'none',authenticatorSelection:{residentKey:'required',userVerification:'required'}}):await this.adapter.generateAuthenticationOptions({rpID:this.config.rpID,userVerification:'required'});
  return {options,challengeId:this.challenge(kind,options.challenge)};
 }
 async verify(kind,body,token){
  const expectedChallenge=this.consume(body.challengeId,kind);
  const opts={response:body.response,expectedChallenge,expectedOrigin:this.config.origin,expectedRPID:this.config.rpID,requireUserVerification:true};
  let principal;
  if(kind==='register'){
   if(!this.enrollAllowed(token))throw Error('Enrollment unavailable');
   const r=await this.adapter.verifyRegistrationResponse(opts);
   if(!r.verified||!r.registrationInfo)throw Error('Verification failed');
   const c=r.registrationInfo.credential;principal='owner';
   this.db.exec('BEGIN IMMEDIATE');try{
    if(!this.enrollAllowed(token))throw Error('Enrollment unavailable');
    this.db.prepare("INSERT OR IGNORE INTO principals VALUES(?,'human')").run(principal);
    this.db.prepare('INSERT INTO passkeys VALUES(?,?,?,?,?)').run(c.id,principal,c.publicKey,c.counter,JSON.stringify(c.transports||[]));this.db.exec('COMMIT');
   }catch(e){this.db.exec('ROLLBACK');throw e;}
  }else{
   const c=this.db.prepare('SELECT * FROM passkeys WHERE id=?').get(String(body.response?.id||''));if(!c)throw Error('Unknown credential');
   const r=await this.adapter.verifyAuthenticationResponse({...opts,credential:{id:c.id,publicKey:new Uint8Array(c.public_key),counter:c.counter,transports:JSON.parse(c.transports)}});
   if(!r.verified)throw Error('Verification failed');
   const changed=this.db.prepare('UPDATE passkeys SET counter=? WHERE id=? AND counter=?').run(r.authenticationInfo.newCounter,c.id,c.counter);if(changed.changes!==1)throw Error('Concurrent authentication');principal=c.principal;
  }
  return this.createSession(principal);
 }
 createSession(principal){this.prune();const token=secret(),csrf=secret();this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),principal,csrf,Date.now()+this.config.sessionMs);return {token,csrf};}
 identify(req){
  if(req.headers.authorization){const token=req.headers.authorization.match(/^Bearer (\S+)$/)?.[1];if(!token)return null;const s=this.services.find(s=>s.expires>Date.now()&&equal(s.tokenHash,digest(token)));return s?{kind:'service',id:s.id,scopes:s.scopes}:null;}
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-hibou='))?.slice(13);
  if(!token)return null;const s=this.db.prepare('SELECT * FROM sessions WHERE digest=? AND expires>?').get(digest(token),Date.now());return s?{kind:'human',id:s.principal,csrf:s.csrf,digest:s.digest,scopes:['board:read','board:write']}:null;
 }
 authorize(req,scope){const p=this.identify(req);if(!p||!p.scopes.includes(scope))return null;if(req.method!=='GET'&&p.kind==='human'&&(req.headers.origin!==this.config.origin||!equal(req.headers['x-csrf-token'],p.csrf)))return null;return p;}
 cookie(token){return `__Host-hibou=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(this.config.sessionMs/1000)}`;}
}
