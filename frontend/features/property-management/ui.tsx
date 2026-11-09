'use client';
import type { ReactNode, FormEvent } from 'react';
import {summaryTone} from '@/components/ui/status';
export const panel='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-[#17211f]';
export const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-600 dark:border-slate-600';
export const primary='inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50';
export const secondary='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-600';
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="block space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>}
export function FormCard({title,onSubmit,onCancel,children,save='Save'}:{title:string;onSubmit:(e:FormEvent)=>void;onCancel:()=>void;children:ReactNode;save?:string}){return <form onSubmit={onSubmit} className={`${panel} space-y-4`}><h2 className="text-lg font-semibold">{title}</h2>{children}<div className="flex gap-2"><button className={primary} type="submit" data-action-tone="success">{save}</button><button className={secondary} type="button" onClick={onCancel}>Cancel</button></div></form>}
export function Empty({text}:{text:string}){return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{text}</div>}
export function Header({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:ReactNode}){return <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 text-sm text-slate-500">{description}</p></div>{action}</div>}
export function Count({label,value}:{label:string;value:number|string}){return <div data-summary-tone={summaryTone(label)} className={panel}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>}
