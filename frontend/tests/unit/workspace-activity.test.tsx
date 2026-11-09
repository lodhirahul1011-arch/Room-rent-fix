import {beforeEach,describe,expect,it} from 'vitest';
import {act,renderHook} from '@testing-library/react';
import {useBrowserState} from '@/features/workspace/browser-state';
import {describeChanges,readActivities,markActivitiesRead,ACTIVITY_KEY} from '@/features/workspace/activity';
import {emptyPortfolio} from '@/features/property-management/clean-data';
import {endTenancy} from '@/features/property-management/logic';
import type {Portfolio} from '@/features/property-management/types';

beforeEach(()=>localStorage.clear());
const normalize=(value:unknown)=>value as Portfolio;
const setup=()=>{
 const p=emptyPortfolio();
 p.properties.push({id:'p',name:'Building',location:'Delhi',address:'Delhi',createdAt:'2026-11-09'});
 p.rooms.push({id:'r',propertyId:'p',floorId:'f',number:'101',rentPaise:100000,status:'active'});
 p.tenants.push({id:'t',name:'Test tenant',email:'test@example.test',phone:'9999999999',emergencyContact:'',notes:''});
 p.tenancies.push({id:'lease',tenantId:'t',roomId:'r',moveIn:'2026-11-09',moveOut:null,status:'active'});
 return p;
};
describe('Synchronous actions and activity notifications',()=>{
 it('catches invalid move-out without mutating storage or emitting a notification',()=>{
  const p=setup();localStorage.setItem('test-workspace',JSON.stringify(p));
  const {result}=renderHook(()=>useBrowserState('test-workspace',emptyPortfolio,normalize,'portfolio'));
  expect(()=>result.current.update(previous=>endTenancy(previous,'lease','2026-11-01'))).toThrow('Move-out cannot precede move-in');
  expect(result.current.value.tenancies[0].status).toBe('active');
  expect(JSON.parse(localStorage.getItem('test-workspace')!).tenancies[0].status).toBe('active');
  expect(readActivities()).toHaveLength(0);
 });
 it('records one successful move-out and keeps notification reads separate for each role',()=>{
  const p=setup();localStorage.setItem('test-workspace',JSON.stringify(p));
  const {result}=renderHook(()=>useBrowserState('test-workspace',emptyPortfolio,normalize,'portfolio'));
  act(()=>result.current.update(previous=>endTenancy(previous,'lease','2026-11-10')));
  expect(result.current.value.tenancies[0].status).toBe('ended');
  expect(readActivities()).toHaveLength(1);expect(readActivities()[0].title).toBe('Tenant moved out');
  markActivitiesRead('owner');expect(readActivities()[0].readBy).toEqual(['owner']);
  expect(readActivities()[0].roles).toContain('admin');
 });
 it('applies batched updates to the latest committed state',()=>{
  const {result}=renderHook(()=>useBrowserState('test-workspace',emptyPortfolio,normalize,'portfolio'));
  act(()=>{for(const id of ['a','b'])result.current.update(p=>({...p,properties:[...p.properties,{id,name:id,address:'',location:'',createdAt:''}]}))});
  expect(result.current.value.properties.map(p=>p.id)).toEqual(['a','b']);expect(readActivities()).toHaveLength(2);
 });
 it('loads cross-tab changes without duplicating notifications',()=>{
  const {result}=renderHook(()=>useBrowserState('test-workspace',emptyPortfolio,normalize,'portfolio'));
  act(()=>{const p=setup();localStorage.setItem('test-workspace',JSON.stringify(p));window.dispatchEvent(new StorageEvent('storage',{key:'test-workspace',newValue:JSON.stringify(p)}))});
  expect(result.current.value.tenancies).toHaveLength(1);expect(localStorage.getItem(ACTIVITY_KEY)).toBeNull();
 });
 it('distinguishes submitted payments from verified receipts',()=>{
  const before={payments:[]};const submitted={id:'payment',tenantId:'t',invoiceId:'i',amountPaise:50000,method:'upi',status:'submitted'};
  const events=describeChanges('finance',before,{payments:[submitted]},setup());
  expect(events[0].title).toBe('Payment submitted');expect(events[0].detail).toContain('awaiting verification');
  const verified=describeChanges('finance',{payments:[submitted]},{payments:[{...submitted,status:'verified'}]},setup());
  expect(verified).toHaveLength(1);expect(verified[0].title).toBe('Payment verified');expect(verified[0].detail).toContain('Test tenant');
 });
});

it('synchronizes multiple workspace providers in the same tab without duplicate activity',()=>{
 const first=renderHook(()=>useBrowserState('shared-workspace',emptyPortfolio,normalize,'portfolio'));
 const second=renderHook(()=>useBrowserState('shared-workspace',emptyPortfolio,normalize,'portfolio'));
 act(()=>first.result.current.update(p=>({...p,properties:[{id:'new',name:'New building',location:'Delhi',address:'Address',createdAt:'2026-11-09'}]})));
 expect(second.result.current.value.properties[0].name).toBe('New building');
 expect(readActivities()).toHaveLength(1);
});
