import type {ReactNode} from 'react';
export type StatusTone='success'|'pending'|'danger'|'info'|'neutral';
export function statusTone(status:unknown):StatusTone{
 const value=String(status||'').trim().toLowerCase().replace(/_/g,'-');
 if(['paid','approved','verified','resolved','success','successful','active','available','vacant','online','connected','completed','settled','finalized'].includes(value))return 'success';
 if(['pending','submitted','unpaid','partial','new','trial','maintenance','held','ringing','awaiting-verification','draft'].includes(value))return 'pending';
 if(['rejected','reject','overdue','failed','failure','suspended','disabled','declined','cancelled','error'].includes(value))return 'danger';
 if(['in-progress','processing','occupied','issued','info','correction'].includes(value))return 'info';
 return 'neutral';
}
export function summaryTone(label:string):StatusTone{
 if(/overdue|reject|fail/i.test(label))return 'danger';
 if(/pending|outstanding|remaining|waiting|held|unpaid|maintenance/i.test(label))return 'pending';
 if(/paid|verified|collect|received|approved|resolved|vacant|active/i.test(label))return 'success';
 return 'info';
}
export function StatusBadge({status,label}:{status:unknown;label?:ReactNode}){
 const text=String(status||'Unknown').replace(/[-_]/g,' ');
 return <span className="rr-status" data-status-tone={statusTone(status)}><span className="rr-status-dot" aria-hidden="true"/>{label??(text.charAt(0).toUpperCase()+text.slice(1))}</span>;
}

export function actionTone(label:string):StatusTone{
 if(/reject|decline|suspend|delete|remove|disable|move.out/i.test(label))return 'danger';
 if(/approve|verify|activate|resolve|settle|save|submit|generate|assign|register|add|create/i.test(label))return 'success';
 if(/pending|penalty|start work|pause|maintenance/i.test(label))return 'pending';
 return 'info';
}
