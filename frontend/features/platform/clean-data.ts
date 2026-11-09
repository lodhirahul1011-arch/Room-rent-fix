import {initialPlatform,type Platform} from './engine';
export const emptyPlatform=():Platform=>({owners:[],subscriptions:[],approvals:[],cctv:[],tablets:[],calls:[]});
export function removeDemoPlatform(value:Platform):Platform {
  return {...value,
    owners:value.owners.filter(record=>!initialPlatform.owners.some(seed=>seed.id===record.id)),
    subscriptions:value.subscriptions.filter(record=>!initialPlatform.subscriptions.some(seed=>seed.id===record.id)),
    approvals:value.approvals.filter(record=>!initialPlatform.approvals.some(seed=>seed.id===record.id)),
  };
}
