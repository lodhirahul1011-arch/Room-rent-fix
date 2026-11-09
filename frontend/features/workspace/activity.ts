export type Domain='portfolio'|'finance'|'operations'|'platform';
export type ActivityRole='admin'|'owner'|'tenant';
export type Activity={id:string;title:string;detail:string;at:string;roles:ActivityRole[];readBy:ActivityRole[];collection?:string;entityId?:string;propertyId?:string;tenantId?:string;tenantPhone?:string};
export const ACTIVITY_KEY='roomrent-workspace-activity-v1';
const PORTFOLIO_KEY='roomrent-phase3-portfolio-v1';
type Row={id:string;[key:string]:unknown};
const collections:Record<Domain,Record<string,string>>={
 portfolio:{properties:'Property',floors:'Floor',rooms:'Room',tenants:'Tenant',tenancies:'Tenancy',enrollments:'Enrollment'},
 finance:{invoices:'Invoice',payments:'Payment',penalties:'Penalty',adjustments:'Adjustment',meters:'Meter reading'},
 operations:{tickets:'Maintenance request',notices:'Notice',documents:'Document',deposits:'Deposit'},
 platform:{owners:'Owner account',subscriptions:'Subscription',approvals:'Approval',cctv:'CCTV shortcut',tablets:'Tablet',calls:'Call'},
};
const currency=(n:unknown)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n||0)/100);
export function readActivities():Activity[]{try{const rows=JSON.parse(localStorage.getItem(ACTIVITY_KEY)||'[]');return Array.isArray(rows)?rows.filter(r=>typeof r.id==='string'&&Array.isArray(r.roles)&&Array.isArray(r.readBy)):[]}catch{return []}}
function save(rows:Activity[]){try{localStorage.setItem(ACTIVITY_KEY,JSON.stringify(rows.slice(0,500)));window.dispatchEvent(new Event('roomrent:activity'))}catch{}}
export function publishActivity(title:string,detail:string,roles:ActivityRole[]=['admin','owner','tenant']){
 save([{id:crypto.randomUUID(),title,detail,at:new Date().toISOString(),roles,readBy:[]},...readActivities()]);
}
export function markActivitiesRead(role:ActivityRole,ids?:string[]){save(readActivities().map(row=>row.roles.includes(role)&&(!ids||ids.includes(row.id))?{...row,readBy:Array.from(new Set([...row.readBy,role]))}:row))}
export function describeChanges(domain:Domain,before:unknown,after:unknown,portfolio?:unknown):Omit<Activity,'id'|'at'|'readBy'>[]{
 const old=before as Record<string,unknown>,next=after as Record<string,unknown>;
 const p=portfolio as {tenants?:Row[];rooms?:Row[];properties?:Row[]}|undefined;
 const tenantName=(id:unknown)=>String(p?.tenants?.find(t=>t.id===id)?.name||'Tenant');
 const changes:Omit<Activity,'id'|'at'|'readBy'>[]=[];
 for(const [key,label] of Object.entries(collections[domain])){
  const previous=new Map(((old[key]||[]) as Row[]).map(row=>[row.id,row]));
  const rows=(next[key]||[]) as Row[];
  for(const row of rows){
   const prior=previous.get(row.id);
   if(prior&&JSON.stringify(prior)===JSON.stringify(row))continue;
   let title=label+(prior?' updated':' created');
   let detail=String(row.name||row.title||row.label||row.number||row.month||label);
   const roles:ActivityRole[]=domain==='platform'?['admin','owner']:['admin','owner','tenant'];
   if(key==='enrollments'){title=prior?'Enrollment '+String(row.status):'New enrollment request';detail=String(row.applicantName)+' · '+String(row.status)}
   if(key==='tenancies'){title=row.status==='ended'?'Tenant moved out':'Tenant moved in';detail=tenantName(row.tenantId)+' · '+(row.status==='ended'?String(row.moveOut):String(row.moveIn))}
   if(key==='payments'){title='Payment '+String(row.status);detail=tenantName(row.tenantId)+' · '+currency(row.amountPaise)+' · '+String(row.method).toUpperCase();if(row.status==='submitted')detail+=' · awaiting verification'}
   if(key==='invoices'){detail=tenantName(row.tenantId)+' · '+String(row.month)+' · '+currency(((row.originalItems||[]) as {amountPaise:number}[]).reduce((sum,item)=>sum+item.amountPaise,0))}
   if(key==='rooms'){detail='Room '+String(row.number)+' · '+String(row.status)+' · '+currency(row.rentPaise)}
   if(key==='tickets'||key==='documents'||key==='deposits'){detail=tenantName(row.tenantId)+' · '+String(row.title||row.category||label)+' · '+String(row.status||row.verification||'submitted')}
   if(key==='penalties'||key==='adjustments')detail=currency(row.amountPaise)+' · '+String(row.reason||label);
   const tenant=p?.tenants?.find(t=>t.id===row.tenantId);
   changes.push({title,detail,roles,collection:key,entityId:row.id,propertyId:String(row.propertyId||(key==='properties'?row.id:'')),tenantId:String(row.tenantId||''),tenantPhone:String(key==='enrollments'?row.phone||'':tenant?.phone||'')});
  }
  const ids=new Set(rows.map(row=>row.id));
  for(const row of Array.from(previous.values()))if(!ids.has(row.id))changes.push({title:label+' removed',detail:String(row.name||row.title||row.label||row.number||label),roles:['admin','owner'],collection:key});
 }
 if(domain==='finance'&&JSON.stringify(old.rule)!==JSON.stringify(next.rule))changes.push({title:'Penalty settings updated',detail:'Late-payment rules were updated.',roles:['admin','owner']});
 return changes;
}
export function recordChanges(domain:Domain,before:unknown,after:unknown){
 try{
  const portfolio=JSON.parse(localStorage.getItem(PORTFOLIO_KEY)||'{}');
  const events=describeChanges(domain,before,after,portfolio);
  if(!events.length)return;
  const at=new Date().toISOString();
  save([...events.reverse().map(row=>({...row,id:crypto.randomUUID(),at,readBy:[]})),...readActivities()]);
 }catch{}
}
