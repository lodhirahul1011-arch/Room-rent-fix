'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {initialOperations,type Operations} from './engine';
import {useBrowserState} from '@/features/workspace/browser-state';
const Context=createContext<{data:Operations;ready:boolean;update:(fn:(s:Operations)=>Operations)=>void}|null>(null);
const normalize=(raw:unknown):Operations=>{const value=raw as Operations;if(!value||!['tickets','notices','documents','deposits'].every(key=>Array.isArray(value[key as keyof Operations])))throw Error('Invalid operations');return value};
export function OperationsProvider({children}:{children:ReactNode}){const state=useBrowserState('roomrent-phase6-operations-v1',initialOperations,normalize,'operations');return <Context.Provider value={{data:state.value,ready:state.ready,update:state.update}}>{children}</Context.Provider>}
export function useOperations(){const context=useContext(Context);if(!context)throw Error('OperationsProvider missing');return context;}
