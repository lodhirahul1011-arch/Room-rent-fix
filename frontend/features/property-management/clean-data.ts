import {createSeedPortfolio} from './seed';
import type {Portfolio} from './types';
export const emptyPortfolio = ():Portfolio => ({properties:[],floors:[],rooms:[],tenants:[],tenancies:[],enrollments:[]});
export function removeDemoPortfolio(value:Portfolio):Portfolio {
  const seed=createSeedPortfolio();
  const result={...value};
  for(const key of ['properties','floors','rooms','tenants','tenancies'] as const){
    const ids=new Set(seed[key].map(record=>record.id));
    (result[key] as {id:string}[])=value[key].filter(record=>!ids.has(record.id));
  }
  return {...result,enrollments:value.enrollments||[]};
}
