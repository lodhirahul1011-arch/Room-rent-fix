import type { Portfolio } from '../property-management/types';
export type ChargeKind = 'rent' | 'electricity' | 'maintenance' | 'other';
export type InvoiceItem = {kind:ChargeKind; label:string; amountPaise:number};
export type Invoice = {id:string; key:string; tenancyId:string; tenantId:string; propertyId:string; roomId:string; month:string; issuedAt:string; dueDate:string; originalItems:InvoiceItem[]; status:'issued';};
export type PenaltyRule = {graceDays:number; mode:'fixed'|'per-day'|'percentage'; value:number};
export type Penalty = {id:string; invoiceId:string; appliedAt:string; amountPaise:number; rule:PenaltyRule};
export type Payment = {id:string; invoiceId:string; tenantId:string; amountPaise:number; method:'upi'|'bank'|'cash'; reference:string; proof?:{name:string;size:number;type:string;stored?:boolean}; status:'submitted'|'verified'|'rejected'; rejectionReason?:string; submittedAt:string; decidedAt?:string};
export type Adjustment = {id:string; invoiceId:string; amountPaise:number; reason:string; createdAt:string; reversesId?:string};
export type MeterRecord = {id:string; invoiceId:string; roomId:string; month:string; previous:number; current:number; ratePaise:number; amountPaise:number; recordedAt:string};
export type FinanceState = {invoices:Invoice[]; penalties:Penalty[]; payments:Payment[]; adjustments:Adjustment[]; meters:MeterRecord[]; rule:PenaltyRule};
export const initialFinance = ():FinanceState=>({invoices:[],penalties:[],payments:[],adjustments:[],meters:[],rule:{graceDays:15,mode:'fixed',value:25000}});
export const rupees=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(paise/100);
export const paisa=(rupeesAmount:number)=>{if(!Number.isFinite(rupeesAmount)||rupeesAmount<0||rupeesAmount>100000000)throw Error('Invalid amount');return Math.round(rupeesAmount*100)};
const validMonth=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const validDate=(value:string)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value};
export function validatePenaltyRule(rule:PenaltyRule):PenaltyRule{
 if(!Number.isInteger(rule.graceDays)||rule.graceDays<0||rule.graceDays>365)throw Error('Invalid penalty grace days');
 if(!['fixed','per-day','percentage'].includes(rule.mode)||!Number.isInteger(rule.value)||rule.value<=0)throw Error('Invalid penalty rule');
 if(rule.mode==='percentage'&&rule.value>10000)throw Error('Penalty percentage cannot exceed 100%');
 if(rule.mode!=='percentage'&&rule.value>100000000)throw Error('Penalty amount too large');
 return {...rule};
}

export function invoiceTotal(s:FinanceState,i:Invoice){return i.originalItems.reduce((sum,x)=>sum+x.amountPaise,0)+s.penalties.filter(p=>p.invoiceId===i.id).reduce((sum,x)=>sum+x.amountPaise,0)+s.adjustments.filter(a=>a.invoiceId===i.id).reduce((sum,x)=>sum+x.amountPaise,0)}
export function invoicePaid(s:FinanceState,id:string){return s.payments.filter(p=>p.invoiceId===id&&p.status==='verified').reduce((sum,p)=>sum+p.amountPaise,0)}
export function invoiceBalance(s:FinanceState,i:Invoice){return invoiceTotal(s,i)-invoicePaid(s,i.id)}
export function invoiceStatus(s:FinanceState,i:Invoice,today:string){const balance=invoiceBalance(s,i);return balance<=0?'paid':today>i.dueDate?'overdue':invoicePaid(s,i.id)>0?'partial':'unpaid'}
export function createMonthlyInvoices(s:FinanceState,p:Portfolio,month:string,dueDay:number=5):FinanceState{
 if(!validMonth(month)||!Number.isInteger(dueDay)||dueDay<1||dueDay>28)throw Error('Invalid month or due day');
 const monthStart=`${month}-01`;const lastDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
 const invoices=[...s.invoices];
 for(const t of p.tenancies){if(t.moveIn>lastDay || (t.moveOut && t.moveOut<monthStart))continue;
 const room=p.rooms.find(r=>r.id===t.roomId);if(!room)continue;
 const key=`${t.id}:${month}`;if(invoices.some(i=>i.key===key))continue;
 invoices.push({id:crypto.randomUUID(),key,tenancyId:t.id,tenantId:t.tenantId,propertyId:room.propertyId,roomId:room.id,month,issuedAt:monthStart,dueDate:`${month}-${String(dueDay).padStart(2,'0')}`,originalItems:[{kind:'rent',label:'Monthly room rent',amountPaise:room.rentPaise}],status:'issued'});
 }return {...s,invoices};}
export function addCharge(s:FinanceState,id:string,kind:ChargeKind,label:string,amountPaise:number):FinanceState{
 const invoice=s.invoices.find(x=>x.id===id);if(!invoice)throw Error('Invoice not found');
 if(invoicePaid(s,id)>0||s.penalties.some(p=>p.invoiceId===id))throw Error('Charges locked after payment or penalty');
 if(kind==='rent'||!label.trim()||!Number.isInteger(amountPaise)||amountPaise<=0)throw Error('Invalid charge');
 // Amendment is separate: original invoiceItems remain an immutable snapshot.
 return addAdjustment(s,id,amountPaise,`${kind}: ${label.trim()}`);
}
export function recordMeterReading(s:FinanceState,invoiceId:string,previous:number,current:number,ratePaise:number):FinanceState{
 const invoice=s.invoices.find(i=>i.id===invoiceId);if(!invoice)throw Error('Invoice not found');
 if(!Number.isSafeInteger(previous)||!Number.isSafeInteger(current)||previous<0||current<previous||!Number.isSafeInteger(ratePaise)||ratePaise<0)throw Error('Invalid meter reading');
 if(s.meters.some(m=>m.invoiceId===invoiceId))throw Error('Meter charge already entered for this invoice');
 if(invoicePaid(s,invoiceId)>0||s.penalties.some(p=>p.invoiceId===invoiceId))throw Error('Meter reading is locked after payment or penalty');
 const amountPaise=(current-previous)*ratePaise;
 if(!Number.isSafeInteger(amountPaise)||amountPaise<=0)throw Error('Meter charge must be positive');
 const revised=addAdjustment(s,invoiceId,amountPaise,`Electricity: ${current-previous} units × ${rupees(ratePaise)}`);
 return {...revised,meters:[...s.meters,{id:crypto.randomUUID(),invoiceId,roomId:invoice.roomId,month:invoice.month,previous,current,ratePaise,amountPaise,recordedAt:new Date().toISOString()}]};
}

export function penaltyForInvoice(s:FinanceState,i:Invoice,asOf:string):number{
 validatePenaltyRule(s.rule);if(!validDate(asOf)||!validDate(i.dueDate))throw Error('Invalid penalty date');
 if(s.penalties.some(p=>p.invoiceId===i.id))return 0;
 const balance=invoiceBalance(s,i);if(balance<=0)return 0;
 const day=Math.floor((Date.parse(asOf+'T00:00:00Z')-Date.parse(i.dueDate+'T00:00:00Z'))/86400000);
 if(!Number.isFinite(day)||day<=s.rule.graceDays)return 0;
 const overdueDays=day-s.rule.graceDays;
 if(s.rule.mode==='fixed')return s.rule.value;
 if(s.rule.mode==='per-day')return Math.round(s.rule.value*overdueDays);
 return Math.round(balance*s.rule.value/10000); // percentage rule value in basis points
}
export function applyPenalty(s:FinanceState,invoiceId:string,asOf:string):FinanceState{
 const i=s.invoices.find(x=>x.id===invoiceId);if(!i)throw Error('Invoice not found');
 const amount=penaltyForInvoice(s,i,asOf);if(amount<=0)return s;
 return {...s,penalties:[...s.penalties,{id:crypto.randomUUID(),invoiceId,appliedAt:asOf,amountPaise:amount,rule:{...s.rule}}]};
}
export function submitPayment(s:FinanceState,invoiceId:string,amountPaise:number,method:Payment['method'],reference:string,proof?:Payment['proof'],paymentId:string=crypto.randomUUID()):FinanceState{
 const i=s.invoices.find(x=>x.id===invoiceId);if(!i)throw Error('Invoice not found');
 if(!Number.isSafeInteger(amountPaise)||amountPaise<=0||amountPaise>invoiceBalance(s,i))throw Error('Amount exceeds outstanding balance');
 if(!['upi','bank','cash'].includes(method)||!reference.trim())throw Error('Payment method and reference required');
 if(method!=='cash'&&!proof)throw Error('UPI or bank payment requires proof metadata');
 if(proof&&(!Number.isSafeInteger(proof.size)||proof.size<=0||proof.size>5_000_000||!['image/jpeg','image/png','application/pdf'].includes(proof.type)))throw Error('Invalid proof type/size');
 if(s.payments.some(p=>p.invoiceId===invoiceId&&p.reference.toLocaleLowerCase('en-IN')===reference.trim().toLocaleLowerCase('en-IN')&&p.status!=='rejected'))throw Error('Duplicate payment reference');
 const reserved=s.payments.filter(p=>p.invoiceId===invoiceId&&p.status==='submitted').reduce((a,p)=>a+p.amountPaise,0);
 if(amountPaise>invoiceBalance(s,i)-reserved)throw Error('Existing pending payment proof already reserves this amount');
 return {...s,payments:[...s.payments,{id:paymentId,invoiceId,tenantId:i.tenantId,amountPaise,method,reference:reference.trim(),proof,status:'submitted',submittedAt:new Date().toISOString()}]};
}
export function decidePayment(s:FinanceState,paymentId:string,approve:boolean,reason=''):FinanceState{
 const p=s.payments.find(x=>x.id===paymentId);if(!p||p.status!=='submitted')throw Error('Payment already decided or missing');
 if(!approve&&!reason.trim())throw Error('Rejection reason is required');
 const i=s.invoices.find(x=>x.id===p.invoiceId);if(!i)throw Error('Invoice missing');
 if(approve&&p.amountPaise>invoiceBalance(s,i))throw Error('Amount exceeds remaining balance');
 return {...s,payments:s.payments.map(x=>x.id===paymentId?{...x,status:approve?'verified':'rejected',rejectionReason:approve?undefined:reason.trim(),decidedAt:new Date().toISOString()}:x)};
}
export function addAdjustment(s:FinanceState,invoiceId:string,amountPaise:number,reason:string,reversesId?:string):FinanceState{
 const i=s.invoices.find(x=>x.id===invoiceId);if(!i||!Number.isSafeInteger(amountPaise)||amountPaise===0||!reason.trim())throw Error('Invalid adjustment');
 if(reversesId){const prior=s.adjustments.find(x=>x.id===reversesId&&x.invoiceId===invoiceId);if(!prior||amountPaise!==-prior.amountPaise||s.adjustments.some(x=>x.reversesId===reversesId))throw Error('Invalid reversal');}
 if(invoiceBalance(s,i)+amountPaise<0)throw Error('Adjustment cannot create a negative outstanding balance');
 return {...s,adjustments:[...s.adjustments,{id:crypto.randomUUID(),invoiceId,amountPaise,reason:reason.trim(),createdAt:new Date().toISOString(),reversesId}]};
}
export type LedgerRow={id:string;date:string;description:string;debitPaise:number;creditPaise:number;balancePaise:number};
export function tenantLedger(s:FinanceState,tenantId:string):LedgerRow[]{
 const entries:{id:string;date:string;description:string;debitPaise:number;creditPaise:number}[]=[];
 for(const i of s.invoices.filter(i=>i.tenantId===tenantId)){
 entries.push({id:i.id,date:i.issuedAt,description:`Invoice ${i.month}`,debitPaise:i.originalItems.reduce((n,c)=>n+c.amountPaise,0),creditPaise:0});
 for(const p of s.penalties.filter(p=>p.invoiceId===i.id))entries.push({id:p.id,date:p.appliedAt,description:'Overdue penalty',debitPaise:p.amountPaise,creditPaise:0});
 for(const a of s.adjustments.filter(a=>a.invoiceId===i.id))entries.push({id:a.id,date:a.createdAt.slice(0,10),description:a.reason,debitPaise:Math.max(a.amountPaise,0),creditPaise:Math.max(-a.amountPaise,0)});
 for(const p of s.payments.filter(p=>p.invoiceId===i.id&&p.status==='verified'))entries.push({id:p.id,date:(p.decidedAt||p.submittedAt).slice(0,10),description:`Verified ${p.method.toUpperCase()} payment`,debitPaise:0,creditPaise:p.amountPaise});
 }
 entries.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));let balance=0;return entries.map(e=>({...e,balancePaise:balance+=e.debitPaise-e.creditPaise}));
}
export function financialSummary(s:FinanceState,today:string){let invoiced=0,collected=0,outstanding=0,overdue=0;for(const i of s.invoices){const total=invoiceTotal(s,i),paid=invoicePaid(s,i.id),balance=total-paid;invoiced+=total;collected+=paid;outstanding+=balance;if(i.dueDate<today)overdue+=Math.max(balance,0)}return {invoiced,collected,outstanding,overdue,pending:outstanding-overdue};}
