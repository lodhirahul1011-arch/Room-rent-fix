import {describe,expect,it} from 'vitest';
import {notificationDestination} from '@/features/workspace/notification-route';
import {findTenantRoom,normalizeTenantPhone} from '@/features/workspace/tenant-room-logic';
import {emptyPortfolio} from '@/features/property-management/clean-data';
import {describeChanges,type Activity} from '@/features/workspace/activity';
const setup=()=>{
 const p=emptyPortfolio();
 p.properties.push({id:'p',name:'Building',location:'Delhi',address:'Address',createdAt:'2026-11-09'});
 p.floors.push({id:'f',propertyId:'p',name:'Ground',order:1});
 p.rooms.push({id:'r',propertyId:'p',floorId:'f',number:'101',rentPaise:100000,status:'active'});
 p.tenants.push({id:'other',name:'Other tenant',phone:'8888888888',email:'other@example.test',emergencyContact:'',notes:''},{id:'t',name:'Approved tenant',phone:'9999999999',email:'qa@example.test',emergencyContact:'',notes:''});
 p.tenancies.push({id:'lease',tenantId:'t',roomId:'r',moveIn:'2026-11-09',moveOut:null,status:'active'});
 return p;
};
const event=(overrides:Partial<Activity>={}):Activity=>({id:'activity',title:'Enrollment approved',detail:'Approved tenant · approved',at:'2026-11-09',roles:['admin','owner','tenant'],readBy:[],...overrides});
describe('Notification destinations and assigned rooms',()=>{
 it('opens the approved applicant room, including legacy notifications',()=>{
  expect(notificationDestination(event(), 'tenant',setup())).toBe('/tenant/my-room?phone=9999999999');
  expect(notificationDestination(event({tenantPhone:'9999999999',collection:'enrollments'}),'tenant')).toBe('/tenant/my-room?phone=9999999999');
 });
 it('routes owner and admin payment notifications to their own sections',()=>{
  const payment=event({title:'Payment verified',collection:'payments'});
  expect(notificationDestination(payment,'owner')).toBe('/owner/payments');
  expect(notificationDestination(payment,'admin')).toBe('/admin/dashboard#tenant-payments');
  expect(notificationDestination(payment,'tenant')).toBe('/tenant/payments');
 });
 it('uses the property ID for room changes and the application ID for owner review',()=>{
  expect(notificationDestination(event({collection:'rooms',propertyId:'p'}),'owner')).toBe('/owner/properties/p');
  expect(notificationDestination(event({collection:'enrollments',entityId:'request'}),'owner')).toBe('/owner/enrollments?status=all#enrollment-request');
 });
 it('selects the matching mobile rather than the first tenant and never leaks another room',()=>{
  const p=setup();expect(findTenantRoom(p,'9999999999').room?.number).toBe('101');
  expect(findTenantRoom(p,'8888888888').room).toBeUndefined();
  expect(findTenantRoom(p,'').room).toBeUndefined();
  expect(findTenantRoom(p,'7777777777').room).toBeUndefined();
 });
 it('normalizes country codes and stops showing an active room after move-out',()=>{
  expect(normalizeTenantPhone('+91 99999 99999')).toBe('9999999999');
  const p=setup();p.tenancies[0]={...p.tenancies[0],status:'ended',moveOut:'2026-11-10'};
  const result=findTenantRoom(p,'09999999999');expect(result.active).toBeUndefined();expect(result.room).toBeUndefined();expect(result.ended?.moveOut).toBe('2026-11-10');
 });
 it('adds entity metadata to new notifications',()=>{
  const p=setup();const changes=describeChanges('portfolio',{tenancies:[]},{tenancies:p.tenancies},p);
  expect(changes[0]).toMatchObject({collection:'tenancies',entityId:'lease',tenantId:'t',tenantPhone:'9999999999'});
 });
});
