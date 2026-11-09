import type {Activity,ActivityRole} from './activity';
import type {Portfolio} from '@/features/property-management/types';
import {normalizeTenantPhone} from './tenant-room-logic';

/** Legacy events without entity metadata still open the related role's section. */
export function notificationDestination(event:Activity,role:ActivityRole,portfolio?:Portfolio){
 const title=event.title.toLowerCase();
 const collection=event.collection||(title.includes('enrollment')?'enrollments':title.includes('moved')||title.includes('tenancy')?'tenancies':title.startsWith('payment')?'payments':title.startsWith('invoice')?'invoices':title.startsWith('maintenance')?'tickets':title.startsWith('document')?'documents':title.startsWith('deposit')?'deposits':title.startsWith('support')?'support':title.startsWith('room')?'rooms':title.startsWith('property')?'properties':title.startsWith('floor')?'floors':title.startsWith('owner')?'owners':title.startsWith('subscription')?'subscriptions':title.startsWith('approval')?'approvals':title.startsWith('tablet')?'tablets':title.startsWith('cctv')?'cctv':title.startsWith('call')?'calls':'');
 const applicant=portfolio?.enrollments?.find(e=>e.id===event.entityId)||portfolio?.enrollments?.find(e=>event.detail.startsWith(e.applicantName+' · '));
 const tenant=portfolio?.tenants.find(t=>t.id===event.tenantId)||portfolio?.tenants.find(t=>event.detail.startsWith(t.name+' · '));
 const phone=normalizeTenantPhone(event.tenantPhone||applicant?.phone||tenant?.phone||'');
 const query=phone?'?phone='+encodeURIComponent(phone):'';
 if(role==='admin')return collection==='support'?'/admin/support':['owners','subscriptions','approvals'].includes(collection)?'/admin/'+collection:'/admin/dashboard#'+(['payments','invoices','penalties','adjustments','meters','deposits'].includes(collection)?'tenant-payments':collection==='tenancies'?'move-outs':collection==='enrollments'?'enrollments':'workspace-activity');
 if(role==='tenant'){
  if(collection==='tenancies'||collection==='rooms'||(collection==='enrollments'&&title.includes('approved')))return '/tenant/my-room'+query;
  if(collection==='enrollments')return '/tenant/enrollment/status'+query;
  if(collection==='support')return '/support';
  if(collection==='tickets')return '/tenant/maintenance';
  if(collection==='payments')return '/tenant/payments';
  if(['invoices','penalties','adjustments','meters'].includes(collection))return '/tenant/invoices';
  if(collection==='documents'||collection==='deposits')return '/tenant/'+collection;
  return '/tenant/dashboard';
 }
 if(collection==='enrollments')return '/owner/enrollments?status=all'+(event.entityId?'#enrollment-'+encodeURIComponent(event.entityId):'');
 if(collection==='tenancies')return '/owner/tenancies';
 if(['rooms','floors','properties'].includes(collection)){const id=event.propertyId||(collection==='properties'?event.entityId:undefined);return '/owner/properties'+(id?'/'+encodeURIComponent(id):'')}
 if(collection==='payments')return '/owner/payments';
 if(['invoices','penalties','adjustments','meters'].includes(collection))return '/owner/invoices';
 if(collection==='tickets')return '/owner/maintenance';
 if(collection==='tablets')return '/owner/devices';
 if(collection==='support')return '/support';
 if(['documents','deposits','approvals','cctv','calls','notifications'].includes(collection))return '/owner/'+collection;
 return '/owner/dashboard';
}
