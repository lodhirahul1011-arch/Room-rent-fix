import type {Portfolio} from '@/features/property-management/types';
import {invoiceBalance,type FinanceState} from './engine';
export type Payee={propertyId:string;upiId:string;name:string;qrImage?:string};
export const DEFAULT_PAYMENT_QR='/payments/rahul-payment-qr.jpg';
export function ensureFirstMonthInvoices(finance:FinanceState,portfolio:Portfolio,today:string):FinanceState{
 const invoices=[...finance.invoices];
 for(const tenancy of portfolio.tenancies){
  if(tenancy.status!=='active'||tenancy.moveOut)continue;
  const room=portfolio.rooms.find(r=>r.id===tenancy.roomId);if(!room)continue;
  const month=tenancy.moveIn.slice(0,7),key=tenancy.id+':'+month;
  if(invoices.some(i=>i.key===key))continue;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(tenancy.moveIn)||!Number.isSafeInteger(room.rentPaise)||room.rentPaise<0)throw Error('Invalid tenancy date or room rent');
  invoices.push({id:crypto.randomUUID(),key,tenancyId:tenancy.id,tenantId:tenancy.tenantId,propertyId:room.propertyId,roomId:room.id,month,issuedAt:today,dueDate:tenancy.moveIn>today?tenancy.moveIn:today,originalItems:[{kind:'rent',label:'First month room rent',amountPaise:room.rentPaise}],status:'issued'});
 }
 return invoices.length===finance.invoices.length?finance:{...finance,invoices};
}
export function upiPaymentUri(payee:Payee,amountPaise:number,invoiceId:string){
 if(!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(payee.upiId.trim())||!payee.name.trim())throw Error('Enter a valid UPI ID and payee name');
 if(!Number.isSafeInteger(amountPaise)||amountPaise<=0)throw Error('A positive outstanding amount is required');
 const query=new URLSearchParams({pa:payee.upiId.trim(),pn:payee.name.trim(),am:(amountPaise/100).toFixed(2),cu:'INR',tn:'RoomRent '+invoiceId});
 return 'upi://pay?'+query.toString();
}
export function availablePaymentAmount(finance:FinanceState,invoiceId:string){
 const invoice=finance.invoices.find(i=>i.id===invoiceId);if(!invoice)return 0;
 const pending=finance.payments.filter(p=>p.invoiceId===invoiceId&&p.status==='submitted').reduce((sum,p)=>sum+p.amountPaise,0);
 return Math.max(0,invoiceBalance(finance,invoice)-pending);
}
