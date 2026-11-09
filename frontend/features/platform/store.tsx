'use client';
import {createContext,useContext,type ReactNode} from 'react';
import type {Platform} from './engine';
import {emptyPlatform,removeDemoPlatform} from './clean-data';
import {useBrowserState} from '@/features/workspace/browser-state';
const Context=createContext<{data:Platform;ready:boolean;update:(fn:(s:Platform)=>Platform)=>void}|null>(null);
const normalize=(raw:unknown):Platform=>{const value=raw as Platform;if(!value||!['owners','subscriptions','approvals','cctv','tablets','calls'].every(key=>Array.isArray(value[key as keyof Platform])))throw Error('Invalid platform');return removeDemoPlatform(value)};
export function PlatformProvider({children}:{children:ReactNode}){const state=useBrowserState('roomrent-phase7-platform-v1',emptyPlatform,normalize,'platform');return <Context.Provider value={{data:state.value,ready:state.ready,update:state.update}}>{children}</Context.Provider>}
export function usePlatform(){const context=useContext(Context);if(!context)throw Error('PlatformProvider missing');return context;}
