import {describe,expect,it} from 'vitest';
import {emptyPortfolio} from '@/features/property-management/clean-data';
import {ensureFirstMonthInvoices,availablePaymentAmount,upiPaymentUri} from '@/features/finance/payment-logic';
import {initialFinance,submitPayment,decidePayment,invoiceBalance} from '@/features/finance/engine';
const portfolio=()=>{const p=emptyPortfolio();p.rooms.push({id:'r',propertyId:'p',floorId:'f',number:'101',rentPaise:150000,status:'active'});p.tenancies.push({id:'lease',tenantId:'t',roomId:'r',moveIn:'2026-11-10',moveOut:null,status:'active'});return p};
describe('First rent invoice and screenshot payment workflow',()=>{
 it('creates exactly one first-month invoice for the assigned rent without backdating the due date',()=>{
  const p=portfolio(),f=ensureFirstMonthInvoices(initialFinance(),p,'2026-11-09');expect(f.invoices).toHaveLength(1);
  expect(f.invoices[0]).toMatchObject({month:'2026-11',dueDate:'2026-11-10',tenantId:'t',tenancyId:'lease'});
  expect(invoiceBalance(f,f.invoices[0])).toBe(150000);
  expect(ensureFirstMonthInvoices(f,p,'2026-11-11')).toBe(f);
 });
 it('does not recreate an existing monthly invoice or invoice an ended tenancy',()=>{
  const p=portfolio(),f=ensureFirstMonthInvoices(initialFinance(),p,'2026-11-15');expect(f.invoices[0].dueDate).toBe('2026-11-15');
  expect(ensureFirstMonthInvoices(f,p,'2026-11-16')).toBe(f);
  p.tenancies[0]={...p.tenancies[0],status:'ended',moveOut:'2026-11-11'};
  expect(ensureFirstMonthInvoices(initialFinance(),p,'2026-11-15').invoices).toHaveLength(0);
 });
 it('requires proof for UPI, reserves submitted amounts, and clears dues only after verification',()=>{
  const f=ensureFirstMonthInvoices(initialFinance(),portfolio(),'2026-11-09'),id=f.invoices[0].id;
  expect(()=>submitPayment(f,id,150000,'upi','REF')).toThrow();
  const pending=submitPayment(f,id,150000,'upi','REF',{name:'screenshot.png',type:'image/png',size:100,stored:true},'proof-id');
  expect(pending.payments[0].id).toBe('proof-id');expect(availablePaymentAmount(pending,id)).toBe(0);
  expect(invoiceBalance(pending,pending.invoices[0])).toBe(150000);
  const paid=decidePayment(pending,'proof-id',true);expect(invoiceBalance(paid,paid.invoices[0])).toBe(0);
 });
 it('releases a rejected amount for corrected proof and rejects double verification',()=>{
  const f=ensureFirstMonthInvoices(initialFinance(),portfolio(),'2026-11-09'),id=f.invoices[0].id;
  const pending=submitPayment(f,id,50000,'cash','REF',undefined,'payment');
  const rejected=decidePayment(pending,'payment',false,'Reference is incorrect');expect(availablePaymentAmount(rejected,id)).toBe(150000);
  const paid=decidePayment(pending,'payment',true);expect(()=>decidePayment(paid,'payment',true)).toThrow();
 });
 it('encodes exact payee, currency, amount and invoice in generated UPI QR payloads',()=>{
  const uri=new URL(upiPaymentUri({propertyId:'p',upiId:'test@bank',name:'Test payee'},150050,'invoice-1'));
  expect(uri.protocol).toBe('upi:');expect(uri.searchParams.get('pa')).toBe('test@bank');expect(uri.searchParams.get('am')).toBe('1500.50');expect(uri.searchParams.get('cu')).toBe('INR');
  expect(()=>upiPaymentUri({propertyId:'p',upiId:'invalid',name:'Test'},100,'i')).toThrow();
 });
});
