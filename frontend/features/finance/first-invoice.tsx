'use client';
import {useEffect,useState} from 'react';
import {usePortfolio} from '@/features/property-management/store';
import {useFinance} from './store';
import {ensureFirstMonthInvoices} from './payment-logic';

export function FirstMonthInvoices(){
 const {portfolio,ready}=usePortfolio();const {finance,ready:financeReady,update}=useFinance();const [error,setError]=useState('');
 useEffect(()=>{if(!ready||!financeReady)return;try{const next=ensureFirstMonthInvoices(finance,portfolio,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}));if(next!==finance)update(s=>ensureFirstMonthInvoices(s,portfolio,new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})));setError('')}catch(e){setError(e instanceof Error?e.message:'Could not create first-month invoice')}},[portfolio,finance,ready,financeReady,update]);
 return error?<p role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">First-month invoice could not be generated: {error}</p>:null;
}
