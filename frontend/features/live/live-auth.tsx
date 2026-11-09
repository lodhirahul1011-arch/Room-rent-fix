'use client';
import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {LIVE_MODE,clearSession,currentSession,request,saveSession} from '@/services/live/api';
import {live} from '@/services/live/contracts';
const field='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';
export function LiveAuth({mode}:{mode:'login'|'register'}){
 const router=useRouter();const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<'owner'|'tenant'>('owner'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(mode==='register'){await live.register(name,email,password,role);setError('Account registered. Sign in with your credentials.');return}
  const session=await live.login(email,password);saveSession(session);router.replace(session.role==='tenant'?'/tenant/dashboard':session.role==='admin'?'/admin/dashboard':'/owner/dashboard');
 }catch(err){setError(err instanceof Error?err.message:'Authentication failed')}finally{setBusy(false)}}
 return <div className="min-h-screen grid place-items-center bg-slate-50 p-5"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold text-slate-900">RoomRent {mode==='login'?'Sign in':'Create account'}</h1><p className="text-sm text-slate-600">Live API mode · your credentials are validated by the RoomRent backend</p>
 {mode==='register'&&<><label className="block text-sm font-medium">Full name</label><input className={field} required minLength={2} value={name} onChange={e=>setName(e.target.value)}/><label className="block text-sm font-medium">Account type</label><select className={field} value={role} onChange={e=>setRole(e.target.value as 'owner'|'tenant')}><option value="owner">Property owner</option><option value="tenant">Tenant</option></select></>}
 <label className="block text-sm font-medium">Email</label><input className={field} type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/><label className="block text-sm font-medium">Password</label><input className={field} type="password" required minLength={mode==='register'?10:1} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/>
 {error&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
 <button disabled={busy} className="w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white disabled:opacity-50" data-action-tone="success">{busy?'Working…':mode==='login'?'Sign in':'Register'}</button>
 <a className="block text-center text-sm text-teal-700 underline" href={mode==='login'?'/register':'/login'}>{mode==='login'?'Create an account':'Already registered? Sign in'}</a></form></div>
}
export function LiveGuard({children}:{children:ReactNode}){
 const pathname=usePathname(),router=useRouter();const [ready,setReady]=useState(!LIVE_MODE);
 useEffect(()=>{if(!LIVE_MODE)return;const session=currentSession();if(pathname==='/login'||pathname==='/register'||pathname==='/') {setReady(true);return}
 if(!session){setReady(false);router.replace('/login');return}
 if((pathname.startsWith('/owner/')&&!['owner','manager'].includes(session.role))||(pathname.startsWith('/tenant/')&&session.role!=='tenant')||(pathname.startsWith('/admin/')&&session.role!=='admin')){setReady(false);router.replace(`/${session.role==='manager'?'owner':session.role}/dashboard`);return}
 setReady(true);
 },[pathname,router]);
 if(!LIVE_MODE||ready)return <>{children}</>;
 return <div className="grid min-h-screen place-items-center text-slate-600">Checking session…</div>;
}
export function LiveSessionBanner(){const [session,setSession]=useState<ReturnType<typeof currentSession>>(null);useEffect(()=>{const update=()=>setSession(currentSession());update();window.addEventListener('roomrent:auth',update);return()=>window.removeEventListener('roomrent:auth',update)},[]);if(!LIVE_MODE)return null;return <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950"><span>Live MongoDB API · {session?.user?.email||'Not signed in'} · {session?.role||'Guest'}</span><button className="rounded-md bg-white px-3 py-1 font-medium" onClick={async()=>{try{await request('/api/auth/logout',{method:'POST'})}catch{}clearSession();window.location.assign('/login')}}>Sign out</button></div>}
