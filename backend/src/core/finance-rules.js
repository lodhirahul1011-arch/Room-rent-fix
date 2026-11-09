const {validDate,safe,dateDiff,penaltyAmount}=require('./finance');
const {fail}=require('./errors');
function money(n,positive=false){if(!safe(n)||(positive&&n===0))fail(400,'Invalid integer paise amount');return n}
function sum(items){const n=items.reduce((t,x)=>t+money(x.amountPaise),0);return money(n)}
function monthBounds(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail(400,'Invalid month');const [y,m]=month.split('-').map(Number);return {first:`${month}-01`,last:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)}}
function dueDate(month,day){if(!Number.isInteger(day)||day<1||day>28)fail(400,'Invalid due day');return `${month}-${String(day).padStart(2,'0')}`}
function normalizeReference(ref){if(typeof ref!=='string'||ref.trim().length<3||ref.trim().length>120)fail(400,'Invalid payment reference');return ref.trim().toLowerCase()}
function allocationPlan(balance,amount){money(balance);money(amount,true);if(amount>balance)fail(409,'Payment exceeds invoice balance');return amount}
function settlementAmount(held,deductions){money(held);money(deductions);if(deductions>held)fail(409,'Deductions exceed held deposit');return held-deductions}
function meterUnits(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*1000))||Math.abs(value*1000-Math.round(value*1000))>0.000001)fail(400,'Meter readings must be nonnegative finite numbers with at most 3 decimal places');return Math.round(value*1000)}
function meterAmount(previous,current,rate){const p=meterUnits(previous),c=meterUnits(current);money(rate);if(c<p)fail(409,'Meter reading cannot decrease; explicit meter replacement/rollover is required');return money(Number((BigInt(c-p)*BigInt(rate)+500n)/1000n))}
function outstanding(original,penalties,adjustments,allocated){return money(original+penalties+adjustments-allocated)}
function ensureDate(s){if(!validDate(s))fail(400,'Invalid calendar date');return s}
module.exports={money,sum,monthBounds,dueDate,normalizeReference,allocationPlan,settlementAmount,meterAmount,meterUnits,outstanding,ensureDate,dateDiff,penaltyAmount};
