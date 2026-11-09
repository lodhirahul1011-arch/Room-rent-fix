import {idOf,request,unwrap,json} from './api';
export interface Property{_id?:string;id?:string;name:string;location:string;address?:string;acceptingEnrollments?:boolean;createdAt?:string}
export interface Floor{_id?:string;id?:string;propertyId:string;name:string;order:number}
export interface Room{_id?:string;id?:string;propertyId:string;floorId:string;number:string;rentPaise:number;status:'active'|'maintenance';occupancy?:'occupied'|'vacant'|'maintenance'}
export interface Tenant{_id?:string;id?:string;name:string;phone:string;email:string;emergencyContact?:string;notes?:string}
export interface Tenancy{_id?:string;id?:string;tenantId:string;roomId:string;moveIn:string;moveOut?:string|null;status:'active'|'ended'}
export interface Enrollment{_id?:string;id?:string;applicantName:string;phone:string;email:string;propertyId:string;roomId:string;moveIn:string;status:string;rejectionReason?:string;documents?:Array<{category:string;name:string;type:string;size:number}>}
export interface Invoice{_id?:string;id?:string;tenantId:string;tenancyId?:string;propertyId?:string;roomId?:string;month:string;dueDate:string;originalItems:Array<{kind:string;label:string;amountPaise:number}>;status:string}
export interface Payment{_id?:string;id?:string;invoiceId:string;tenantId:string;amountPaise:number;method:string;reference:string;status:string;rejectionReason?:string}
export interface Ticket{_id?:string;id?:string;propertyId:string;roomId:string;tenantId:string;title:string;description:string;status:string}
export interface Notice{_id?:string;id?:string;title:string;body:string;readAt?:string|null;createdAt?:string}
export interface Deposit{_id?:string;id?:string;tenancyId:string;amountPaise:number;deductionsPaise:number;refundPaise:number;status:string}
export interface LedgerEntry{_id?:string;id?:string;description:string;debitPaise:number;creditPaise:number;balancePaise:number;occurredAt?:string}
export type CatalogProperty={id:string;name:string;location:string};
export type CatalogRoom={id:string;propertyId:string;number:string;rentPaise:number};
export const live={
  list:<T>(resource:string)=>unwrap(request<T[]>(`/api/${resource}`)),
  create:<T>(resource:string,payload:unknown)=>unwrap(request<T>(`/api/${resource}`,json('POST',payload))),
  patch:<T>(resource:string,id:string,payload:unknown)=>unwrap(request<T>(`/api/${resource}/${id}`,json('PATCH',payload))),
  remove:(resource:string,id:string)=>request<void>(`/api/${resource}/${id}`,json('DELETE')),
  propertyOverview:(id:string)=>unwrap(request<{property:Property;floors:Floor[];rooms:Room[];occupancy:{total:number;occupied:number;vacant:number;maintenance:number};scheduledRentPaise:number}>(`/api/properties/${id}/overview`)),
  catalog:()=>unwrap(request<CatalogProperty[]>('/api/catalog/properties')),
  catalogRooms:(id:string)=>unwrap(request<CatalogRoom[]>(`/api/catalog/properties/${id}/rooms`)),
  enroll:(payload:unknown)=>unwrap(request<Enrollment>('/api/enrollments',json('POST',payload))),
  decide:(id:string,kind:'approve'|'reject',reason?:string)=>unwrap(request<unknown>(`/api/enrollments/${id}/${kind}`,json('POST',kind==='reject'?{reason}:{}))),
  moveOut:(id:string,moveOut:string)=>unwrap(request<Tenancy>(`/api/tenancies/${id}/move-out`,json('POST',{moveOut}))),
  invoices:(month:string,dueDay=5)=>unwrap(request<unknown>('/api/invoices/generate',json('POST',{month,dueDay}))),
  balance:(invoiceId:string)=>unwrap(request<{invoiceId:string;balancePaise:number;totalPaise:number;paidPaise:number}>(`/api/invoices/${invoiceId}/balance`)),
  verifyPayment:(id:string)=>unwrap(request<unknown>(`/api/payments/${id}/verify`,json('POST',{}))),
  rejectPayment:(id:string,reason:string)=>unwrap(request<unknown>(`/api/payments/${id}/reject`,json('POST',{reason}))),
  penalty:(id:string,today:string,value:number)=>unwrap(request<unknown>(`/api/invoices/${id}/penalty`,json('POST',{today,rule:{graceDays:15,mode:'fixed',value}}))),
  submitPayment:(payload:unknown)=>unwrap(request<Payment>('/api/payments',json('POST',payload))),
  ledger:(tenantId:string)=>request<{data:LedgerEntry[];balancePaise:number}>(`/api/tenants/${tenantId}/ledger`),
  tenantLedger:()=>unwrap(request<LedgerEntry[]>('/api/tenant/ledger')),
  reconciliation:(month:string)=>unwrap(request<unknown>(`/api/reports/reconciliation?month=${encodeURIComponent(month)}`)),
  notifications:()=>unwrap(request<Notice[]>('/api/notifications')),
  markNotice:(id:string)=>unwrap(request<Notice>(`/api/notifications/${id}/read`,json('PATCH',{}))),
  login:(email:string,password:string)=>request<import('./api').SessionInfo>('/api/auth/login',json('POST',{email,password})),
  register:(name:string,email:string,password:string,role:'owner'|'tenant')=>request<unknown>(role==='tenant'?'/api/auth/register-tenant':'/api/auth/register',json('POST',{name,email,password})),
  me:()=>request<{user:{id:string;name:string;email:string};actor:{role:string;organizationId:string|null}} >('/api/auth/me'),
  id:idOf,
};
