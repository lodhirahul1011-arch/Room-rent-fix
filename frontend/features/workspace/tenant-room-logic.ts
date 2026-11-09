import type {Portfolio} from '@/features/property-management/types';
const PHONE_KEY='roomrent-selected-tenant-phone';
export function normalizeTenantPhone(value:string){const digits=value.replace(/\D/g,'');return digits.length===12&&digits.startsWith('91')?digits.slice(2):digits.length===11&&digits.startsWith('0')?digits.slice(1):digits}
export function rememberTenantPhone(phone:string){try{sessionStorage.setItem(PHONE_KEY,normalizeTenantPhone(phone))}catch{}}
export function storedTenantPhone(){try{return sessionStorage.getItem(PHONE_KEY)||''}catch{return ''}}
export function findTenantRoom(portfolio:Portfolio,phone:string){
 const normalized=normalizeTenantPhone(phone);
 const valid=normalized.length===10;
 const tenant=valid?portfolio.tenants.find(t=>normalizeTenantPhone(t.phone)===normalized):undefined;
 const applications=valid?(portfolio.enrollments||[]).filter(e=>normalizeTenantPhone(e.phone)===normalized):[];
 const application=[...applications].sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt))[0];
 const tenancies=tenant?portfolio.tenancies.filter(t=>t.tenantId===tenant.id):[];
 const active=tenancies.find(t=>t.status==='active'&&!t.moveOut);
 const ended=tenancies.filter(t=>t.status==='ended').sort((a,b)=>(b.moveOut||'').localeCompare(a.moveOut||''))[0];
 const room=active?portfolio.rooms.find(r=>r.id===active.roomId):undefined;
 const property=room?portfolio.properties.find(p=>p.id===room.propertyId):undefined;
 const floor=room?portfolio.floors.find(f=>f.id===room.floorId):undefined;
 return {tenant,application,active,ended,room,property,floor};
}
