let csrf='';
export const csrfHeaders=()=>csrf?{'X-CSRF-Token':csrf}:{};
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function post(path,body,token){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Enrollment-Token':token}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
async function signIn(register,token){
 const kind=register?'register':'login';const {options,challengeId}=await post(`/api/auth/${kind}/options`,{},token);
 options.challenge=decode(options.challenge);
 if(register){options.user.id=decode(options.user.id);options.excludeCredentials=options.excludeCredentials?.map(c=>({...c,id:decode(c.id)}));}
 else options.allowCredentials=options.allowCredentials?.map(c=>({...c,id:decode(c.id)}));
 const credential=register?await navigator.credentials.create({publicKey:options}):await navigator.credentials.get({publicKey:options});
 const r=credential.response;
 const response={id:credential.id,rawId:encode(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults(),authenticatorAttachment:credential.authenticatorAttachment,response:{clientDataJSON:encode(r.clientDataJSON),...(register?{attestationObject:encode(r.attestationObject),transports:r.getTransports?.()||[]}:{authenticatorData:encode(r.authenticatorData),signature:encode(r.signature),userHandle:r.userHandle?encode(r.userHandle):null})}};
 const session=await post(`/api/auth/${kind}/verify`,{challengeId,response},token);csrf=session.csrf;
}
export async function ensureSession(){
 const r=await fetch('/api/auth/session');if(r.ok){csrf=(await r.json()).csrf||'';return;}
 const app=document.querySelector('#app');app.innerHTML='<main><h1>Hibou Board</h1><p>Passkeyでサインインしてください。</p><button id="sign-in">サインイン</button><details><summary>初回セットアップ</summary><label>セットアップ用トークン<input id="enroll-token" type="password" autocomplete="off"></label><button id="register">Passkeyを登録</button></details><p id="auth-error" role="alert"></p></main>';
 await new Promise(resolve=>{for(const [id,register] of [['sign-in',false],['register',true]])document.getElementById(id).onclick=async()=>{try{await signIn(register,document.getElementById('enroll-token').value);resolve();}catch{document.getElementById('auth-error').textContent='認証できませんでした。再試行してください。';}};});
}
export async function logout(){const r=await fetch('/api/auth/logout',{method:'POST',headers:csrfHeaders()});if(r.ok)location.reload();}
