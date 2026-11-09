'use client';
import {useEffect,useRef,useState} from 'react';
import {recordChanges,type Domain} from './activity';

/** Run validation synchronously so callers can display errors without crashing React. */
export function useBrowserState<T>(key:string,initial:()=>T,normalize:(value:unknown)=>T,domain:Domain){
  const [value,setValue]=useState<T>(initial);
  const current=useRef(value);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const load=()=>{try{const raw=localStorage.getItem(key);const next=raw?normalize(JSON.parse(raw)):initial();current.current=next;setValue(next)}catch{}setReady(true)};
    load();
    const sync=(event:StorageEvent)=>{if(event.key===key||event.key===null)load()};
    const sameTab=(event:Event)=>{if((event as CustomEvent<{key:string}>).detail?.key===key)load()};
    window.addEventListener('roomrent:state',sameTab);
    window.addEventListener('storage',sync);
    return()=>{window.removeEventListener('storage',sync);window.removeEventListener('roomrent:state',sameTab)};
  },[key,initial,normalize]);
  const update=(fn:(previous:T)=>T)=>{
    const previous=current.current;
    const next=fn(previous);
    if(next===previous)return;
    localStorage.setItem(key,JSON.stringify(next));
    current.current=next;
    setValue(next);
    recordChanges(domain,previous,next);
    window.dispatchEvent(new CustomEvent('roomrent:state',{detail:{key}}));
  };
  const reset=()=>update(()=>initial());
  return {value,ready,update,reset};
}
