import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../schema.mjs';
import {Auth,digest} from '../auth.mjs';
import {config} from '../config.mjs';
const cfg={origin:'https://board.example',rpID:'board.example',enrollmentToken:'synthetic-bootstrap-input-for-tests-only',sessionMs:10000};
function setup(adapter,services=[]){const store=openStore(':memory:');return {store,auth:new Auth(store.db,cfg,services,adapter)};}
test('production config fails closed; demo rejects private runtime imports',()=>{
 for(const env of [{HIBOU_MODE:'unknown'},{HIBOU_MODE:'production'},{HIBOU_MODE:'production',HIBOU_ORIGIN:'http://board.example',HIBOU_RP_ID:'board.example'},{HIBOU_MODE:'production',HIBOU_ORIGIN:'https://board.example',HIBOU_RP_ID:'other.example',HIBOU_DATA_DIR:'runtime/private'},{HIBOU_PRIVATE_IMPORT:'private/input.json'},{PORT:'NaN'}])assert.throws(()=>config(env));
 assert.equal(config({HIBOU_MODE:'production',HIBOU_ORIGIN:cfg.origin,HIBOU_RP_ID:cfg.rpID,HIBOU_DATA_DIR:'runtime/private'}).mode,'production');
});
test('SQLite CAS persists one revision and rejects stale writers without overwriting state',()=>{
 const s=openStore(':memory:');try{s.save({revision:0,tasks:[]});s.save({revision:1,tasks:['first']},0);assert.throws(()=>s.save({revision:2,tasks:['stale']},0),/conflict/);assert.deepEqual(s.load(),{revision:1,tasks:['first']});}finally{s.close();}
});
test('Passkey adapter enforces RP/origin/UV, single-use challenges, enrollment closure and counters',async()=>{
 const adapter={
  async generateRegistrationOptions(o){assert.equal(o.authenticatorSelection.userVerification,'required');return {challenge:'synthetic-challenge'};},
  async generateAuthenticationOptions(o){assert.equal(o.userVerification,'required');return {challenge:'synthetic-login-challenge'};},
  async verifyRegistrationResponse(o){assert.equal(o.expectedOrigin,cfg.origin);assert.equal(o.expectedRPID,cfg.rpID);assert.equal(o.requireUserVerification,true);assert.equal(o.expectedChallenge,'synthetic-challenge');return {verified:true,registrationInfo:{credential:{id:'synthetic-credential',publicKey:new Uint8Array([1,2,3]),counter:0,transports:['internal']}}};},
  async verifyAuthenticationResponse(o){assert.equal(o.credential.counter,0);assert.equal(o.requireUserVerification,true);assert.equal(o.expectedChallenge,'synthetic-login-challenge');return {verified:true,authenticationInfo:{newCounter:1}};}
 };
 const {store,auth}=setup(adapter);try{
  await assert.rejects(auth.options('register','wrong'));
  const options=await auth.options('register',cfg.enrollmentToken);
  const session=await auth.verify('register',{challengeId:options.challengeId,response:{}},cfg.enrollmentToken);
  assert.match(auth.cookie(session.token),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal(store.db.prepare('SELECT digest FROM sessions').get().digest,digest(session.token));
  await assert.rejects(auth.verify('register',{challengeId:options.challengeId,response:{}},cfg.enrollmentToken),/challenge/);
  await assert.rejects(auth.options('register',cfg.enrollmentToken),/unavailable/);
  const login=await auth.options('login');await auth.verify('login',{challengeId:login.challengeId,response:{id:'synthetic-credential'}});
  assert.equal(store.db.prepare('SELECT counter FROM passkeys').get().counter,1);
 }finally{store.close();}
});
test('failed verification consumes challenge and creates no credential or session',async()=>{
 const {store,auth}=setup({verifyRegistrationResponse:async()=>({verified:false})});try{
  const id=auth.challenge('register','synthetic');await assert.rejects(auth.verify('register',{challengeId:id,response:{}},cfg.enrollmentToken));
  assert.equal(store.db.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(store.db.prepare('SELECT count(*) n FROM passkeys').get().n,0);assert.throws(()=>auth.consume(id,'register'));
  const expired=auth.challenge('login','synthetic');store.db.prepare('UPDATE challenges SET expires=0').run();assert.throws(()=>auth.consume(expired,'login'));
 }finally{store.close();}
});
test('session CSRF, expiry and scoped service principals fail closed',()=>{
 const token='synthetic-service-token-not-a-credential';
 const {store,auth}=setup(undefined,[{id:'fixture-reader',tokenHash:digest(token),scopes:['board:read'],expires:Date.now()+10000}]);try{
  store.db.prepare("INSERT INTO principals VALUES('owner','human')").run();const s=auth.createSession('owner');
  const req={method:'POST',headers:{cookie:`__Host-hibou=${s.token}`,origin:cfg.origin,'x-csrf-token':s.csrf}};
  assert.ok(auth.authorize(req,'board:write'));assert.equal(auth.authorize({...req,headers:{...req.headers,origin:'https://evil.example'}},'board:write'),null);assert.equal(auth.authorize({...req,headers:{...req.headers,'x-csrf-token':'bad'}},'board:write'),null);
  const service={method:'GET',headers:{authorization:'Bearer '+token}};assert.equal(auth.authorize(service,'board:read').kind,'service');assert.equal(auth.authorize(service,'board:write'),null);
  auth.services[0].expires=0;assert.equal(auth.authorize(service,'board:read'),null);
  store.db.prepare('UPDATE sessions SET expires=0').run();assert.equal(auth.authorize(req,'board:write'),null);
 }finally{store.close();}
});
