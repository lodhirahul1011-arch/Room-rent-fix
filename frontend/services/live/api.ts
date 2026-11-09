/** RoomRent B8 API boundary. Demo mode remains independent of this module. */
export const LIVE_MODE = process.env.NEXT_PUBLIC_ROOMRENT_API_MODE === 'live';
export const API_BASE = (process.env.NEXT_PUBLIC_ROOMRENT_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export type Role = 'admin' | 'owner' | 'manager' | 'tenant';
export type SessionInfo = {accessToken:string;refreshToken:string;role:Role;organizationId:string|null;user:{id:string;name:string;email:string;role:string}};
export type ApiEnvelope<T> = {data:T};
export type ApiErrorBody = {error?:{code?:string;message?:string}};
export class ApiError extends Error {constructor(readonly status:number,message:string){super(message);this.name='ApiError';}}
const STORAGE_KEY='roomrent-b8-session';
export function currentSession(): SessionInfo|null {
  if(typeof window==='undefined')return null;
  try {const raw=sessionStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw) as SessionInfo:null;}catch{return null;}
}
export function saveSession(value:SessionInfo){if(typeof window==='undefined')return;sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value));window.dispatchEvent(new Event('roomrent:auth'));}
export function clearSession(){if(typeof window==='undefined')return;sessionStorage.removeItem(STORAGE_KEY);window.dispatchEvent(new Event('roomrent:auth'));}
let refreshing:Promise<boolean>|undefined;
async function refreshAccess():Promise<boolean>{
  const session=currentSession();if(!session?.refreshToken)return false;
  if(!refreshing)refreshing=(async()=>{
    try{
      const response=await fetch(`${API_BASE}/api/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.refreshToken}),cache:'no-store'});
      if(!response.ok){clearSession();return false;}
      const result=await response.json() as {accessToken:string;refreshToken:string};
      saveSession({...session,accessToken:result.accessToken,refreshToken:result.refreshToken});return true;
    }catch{return false;}
  })().finally(()=>{refreshing=undefined});
  return refreshing;
}
export async function request<T>(path:string,options:RequestInit={},canRefresh=true):Promise<T>{
  if(!path.startsWith('/api/'))throw new Error('Only internal /api/ endpoints are supported');
  const session=currentSession();
  const headers=new Headers(options.headers);
  if(session?.accessToken)headers.set('Authorization',`Bearer ${session.accessToken}`);
  if(options.body && !(options.body instanceof FormData))headers.set('Content-Type','application/json');
  const response=await fetch(`${API_BASE}${path}`,{...options,headers,cache:'no-store'});
  if(response.status===401&&canRefresh&&session?.refreshToken&&await refreshAccess())return request<T>(path,options,false);
  if(!response.ok){let body:ApiErrorBody={};try{body=await response.json() as ApiErrorBody}catch{};if(response.status===401)clearSession();throw new ApiError(response.status,body.error?.message||`HTTP ${response.status}`);}
  if(response.status===204)return undefined as T;
  return response.json() as Promise<T>;
}
export const json=(method:'POST'|'PATCH'|'DELETE',value?:unknown):RequestInit=>({method,...(value!==undefined?{body:JSON.stringify(value)}:{})});
export const unwrap = async <T>(promise: Promise<ApiEnvelope<T> | T>): Promise<T> => {
  const r = (await promise) as any;
  return r && typeof r === 'object' && 'data' in r ? (r.data as T) : (r as T);
};
export function idOf(record:{_id?:string;id?:string}):string{return String(record._id||record.id||'');}
/** Downloads a protected PDF/document with the session's bearer token. */
export async function downloadPrivateFile(fileAssetId:string,filename='roomrent-file'){
 const path=`/api/files/${encodeURIComponent(fileAssetId)}/download`;
 let session=currentSession();if(!session)throw new ApiError(401,'Authentication required');
 let response=await fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${session.accessToken}`},cache:'no-store'});
 if(response.status===401&&await refreshAccess()){session=currentSession();response=await fetch(`${API_BASE}${path}`,{headers:{Authorization:`Bearer ${session?.accessToken||''}`},cache:'no-store'});}
 if(!response.ok)throw new ApiError(response.status,'Document download failed');
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Authenticated binary response using the existing access-token refresh workflow. */
export async function requestBlob(path:string,canRefresh=true):Promise<Blob>{
 if(!path.startsWith('/api/'))throw Error('Only internal /api/ files are supported');
 const session=currentSession();if(!session?.accessToken)throw new ApiError(401,'Authentication required');
 const response=await fetch(API_BASE+path,{headers:{Authorization:'Bearer '+session.accessToken},cache:'no-store'});
 if(response.status===401&&canRefresh&&session.refreshToken&&await refreshAccess())return requestBlob(path,false);
 if(!response.ok){let body:ApiErrorBody={};try{body=await response.json() as ApiErrorBody}catch{}throw new ApiError(response.status,body.error?.message||'Could not load authorized file')}
 return response.blob();
}
