'use client';
import {useEffect,useRef,useState} from 'react';
import {Bell,X} from 'lucide-react';
import Link from 'next/link';
import {LIVE_MODE} from '@/services/live/api';
import {LiveNotificationBell} from './live-notification-bell';
import {usePortfolio} from '@/features/property-management/store';
import {notificationDestination} from './notification-route';
import {ACTIVITY_KEY,readActivities,markActivitiesRead,type Activity,type ActivityRole} from './activity';

function BrowserNotificationBell({role}:{role:ActivityRole}){
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Activity[]>([]);
 const container=useRef<HTMLDivElement>(null);
 const {portfolio}=usePortfolio();
 useEffect(()=>{
  const refresh=()=>setRows(readActivities());refresh();
  const storage=(event:StorageEvent)=>{if(event.key===ACTIVITY_KEY||event.key===null)refresh()};
  const close=(event:MouseEvent)=>{if(container.current&&!container.current.contains(event.target as Node))setOpen(false)};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
  window.addEventListener('roomrent:activity',refresh);window.addEventListener('storage',storage);document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);
  return()=>{window.removeEventListener('roomrent:activity',refresh);window.removeEventListener('storage',storage);document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape)};
 },[]);
 const visible=rows.filter(row=>row.roles.includes(role));
 const unread=visible.filter(row=>!row.readBy.includes(role)).length;
 return <div className="relative" ref={container}>
  <button type="button" className="relative rounded-xl p-2.5 text-[#63736d] hover:bg-[#e9f1ee]" aria-label={'Notifications'+(unread?', '+unread+' unread':'')} aria-expanded={open} onClick={()=>setOpen(!open)}><Bell className="h-5 w-5"/>{unread>0&&<span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{unread>99?'99+':unread}</span>}</button>
  {open&&<section role="dialog" aria-label="Workspace notifications" className="fixed right-3 top-20 z-50 w-[calc(100vw-24px)] max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#17211f] sm:absolute sm:right-0 sm:top-12 sm:w-96">
   <div className="flex items-center justify-between gap-2 border-b p-4"><h2 className="font-semibold">Notifications</h2><button type="button" onClick={()=>setOpen(false)} aria-label="Close notifications"><X size={18}/></button></div>
   <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500"><span>{unread} unread</span><button type="button" className="font-semibold text-teal-700" onClick={()=>markActivitiesRead(role)}>Mark all as read</button></div>
   <div className="max-h-[60vh] overflow-y-auto">{visible.length===0?<p className="p-5 text-sm text-slate-500">No updates yet. New workspace actions will appear here.</p>:visible.slice(0,100).map(row=><Link key={row.id} href={notificationDestination(row,role,portfolio)} onClick={()=>{markActivitiesRead(role,[row.id]);setOpen(false)}} className={'block w-full border-t p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 '+(!row.readBy.includes(role)?'bg-teal-50 dark:bg-teal-950':'')}><span className="block text-sm font-semibold">{row.title}</span><span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{row.detail}</span><time className="mt-2 block text-[10px] text-slate-500">{new Date(row.at).toLocaleString('en-IN')}</time><span className="mt-2 block text-xs font-semibold text-teal-700">Open section →</span></Link>)}</div>
  </section>}
 </div>;
}

export function NotificationBell({role}:{role:ActivityRole}){return LIVE_MODE?<LiveNotificationBell role={role}/>:<BrowserNotificationBell role={role}/>}
