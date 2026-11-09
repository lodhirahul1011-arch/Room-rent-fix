'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {initialFinance,type FinanceState} from './engine';
import {useBrowserState} from '@/features/workspace/browser-state';
const Context=createContext<{finance:FinanceState;ready:boolean;update:(fn:(s:FinanceState)=>FinanceState)=>void;reset:()=>void}|null>(null);
const normalize=(raw:unknown):FinanceState=>{const value=raw as FinanceState;if(!value||!['invoices','payments','penalties','adjustments'].every(key=>Array.isArray(value[key as keyof FinanceState])))throw Error('Invalid finance records');return {...value,meters:Array.isArray(value.meters)?value.meters:[]}};
export function FinanceProvider({children}:{children:ReactNode}){const state=useBrowserState('roomrent-phase5-finance-v1',initialFinance,normalize,'finance');return <Context.Provider value={{finance:state.value,ready:state.ready,update:state.update,reset:state.reset}}>{children}</Context.Provider>}
export function useFinance(){const context=useContext(Context);if(!context)throw Error('FinanceProvider missing');return context;}
