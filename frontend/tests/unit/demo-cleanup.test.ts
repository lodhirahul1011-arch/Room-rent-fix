import {describe,it,expect} from 'vitest';
import {emptyPortfolio,removeDemoPortfolio} from '@/features/property-management/clean-data';
import {createSeedPortfolio} from '@/features/property-management/seed';
import {emptyPlatform,removeDemoPlatform} from '@/features/platform/clean-data';
import {initialPlatform} from '@/features/platform/engine';
import {assignTenant,roomStats} from '@/features/property-management/logic';
describe('Workspace without bundled demo entries',()=>{
 it('starts every record collection empty',()=>{
  for(const records of Object.values(emptyPortfolio()))expect(records).toHaveLength(0);
  for(const records of Object.values(emptyPlatform()))expect(records).toHaveLength(0);
 });
 it('cleans old seed IDs while retaining user-created records and enrollments',()=>{
  const value=createSeedPortfolio();
  const property={...value.properties[0],id:'user-property',name:'My building'};
  const tenant={...value.tenants[0],id:'user-tenant'};
  value.properties.push(property);value.tenants.push(tenant);
  const result=removeDemoPortfolio(value);
  expect(result.properties).toEqual([property]);expect(result.tenants).toEqual([tenant]);
  expect(result.rooms).toEqual([]);expect(removeDemoPortfolio(result)).toEqual(result);
 });
 it('retains custom platform records and device configuration',()=>{
  const owner={...initialPlatform.owners[0],id:'custom-owner'};
  const device={id:'tablet',propertyId:'custom-property',label:'Tablet',code:'PAIR',status:'offline' as const,enabled:true};
  const value={...initialPlatform,owners:[...initialPlatform.owners,owner],tablets:[device]};
  const result=removeDemoPlatform(value);
  expect(result.owners).toEqual([owner]);expect(result.subscriptions).toEqual([]);
  expect(result.approvals).toEqual([]);expect(result.tablets).toEqual([device]);
  expect(removeDemoPlatform(result)).toEqual(result);
 });
 it('still assigns a newly created tenant to a newly created room',()=>{
  const p=emptyPortfolio();
  p.properties.push({id:'p',name:'New property',location:'Delhi',address:'Delhi',createdAt:'2026-11-09'});
  p.floors.push({id:'f',propertyId:'p',name:'Ground floor',order:0});
  p.rooms.push({id:'r',propertyId:'p',floorId:'f',number:'101',rentPaise:100000,status:'active'});
  p.tenants.push({id:'t',name:'New tenant',email:'tenant@example.com',phone:'',emergencyContact:'',notes:''});
  const assigned=assignTenant(p,'t','r','2026-11-09');
  expect(roomStats(assigned).occupied).toBe(1);
  expect(()=>assignTenant(assigned,'t','r','2026-11-09')).toThrow();
 });
});
