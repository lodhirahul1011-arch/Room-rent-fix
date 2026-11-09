'use client';
import {createContext,useContext,type ReactNode} from 'react';
import {emptyPortfolio,removeDemoPortfolio} from './clean-data';
import type {Portfolio} from './types';
import {useBrowserState} from '@/features/workspace/browser-state';
const Context=createContext<{portfolio:Portfolio;ready:boolean;update:(fn:(p:Portfolio)=>Portfolio)=>void;reset:()=>void}|null>(null);
const normalize=(raw:unknown):Portfolio=>{const value=raw as Portfolio;if(!value||!['properties','floors','rooms','tenants','tenancies'].every(key=>Array.isArray(value[key as keyof Portfolio])))throw Error('Invalid portfolio');return removeDemoPortfolio(value)};
export function PortfolioProvider({children}:{children:ReactNode}){const state=useBrowserState('roomrent-phase3-portfolio-v1',emptyPortfolio,normalize,'portfolio');return <Context.Provider value={{portfolio:state.value,ready:state.ready,update:state.update,reset:state.reset}}>{children}</Context.Provider>}
export function usePortfolio(){const context=useContext(Context);if(!context)throw Error('PortfolioProvider missing');return context;}
