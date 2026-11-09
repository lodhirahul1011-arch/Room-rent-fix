'use client';

import {useState,type FormEvent} from 'react';
import {publishActivity} from '@/features/workspace/activity';


const field='w-full rounded-xl border border-[#dbe7e2] bg-white px-3 py-2.5 text-sm text-[#24332d]';
const button='rounded-xl bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115e59] disabled:opacity-50';
type SupportResult={ticketId:string;confirmationSent:boolean};

export function SupportTicketForm(){
  const [values,setValues]=useState({name:'',email:'',phone:'',subject:'',category:'other',message:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<SupportResult|null>(null);

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try{
      const response=await fetch('/api/support/tickets',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(values),
        cache:'no-store',
      });
      const body=await response.json() as {data?:SupportResult;error?:{message?:string}};
      if(!response.ok)throw Error(body.error?.message||'Unable to submit support request');
      if(!body.data?.ticketId)throw Error('The server returned an invalid support response');
      setResult(body.data);
      publishActivity('Support request submitted',body.data.ticketId+' · '+values.subject);
      setValues({name:'',email:'',phone:'',subject:'',category:'other',message:''});
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Unable to submit support request');
    }finally{
      setBusy(false);
    }
  };

  return <section className="rounded-2xl border border-[#e0eae5] bg-white p-5 shadow-sm dark:border-[#34483e] dark:bg-[#1d2926]">
    <h2 className="mb-4 text-lg font-semibold">Create a support ticket</h2>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={submit}>
      <input required minLength={2} maxLength={120} className={field} aria-label="Your name" placeholder="Your name" value={values.name} onChange={event=>setValues(current=>({...current,name:event.target.value}))}/>
      <input required type="email" maxLength={254} className={field} aria-label="Your email" placeholder="Email for ticket confirmation" value={values.email} onChange={event=>setValues(current=>({...current,email:event.target.value}))}/>
      <input type="tel" maxLength={30} className={field} aria-label="Phone number (optional)" placeholder="Phone number (optional)" value={values.phone} onChange={event=>setValues(current=>({...current,phone:event.target.value}))}/>
      <select className={field} aria-label="Support category" value={values.category} onChange={event=>setValues(current=>({...current,category:event.target.value}))}>
        <option value="account">Account</option><option value="rent">Rent</option><option value="maintenance">Maintenance</option><option value="payment">Payment</option><option value="other">Other</option>
      </select>
      <input required minLength={4} maxLength={160} className={`${field} md:col-span-2`} aria-label="Subject" placeholder="Subject" value={values.subject} onChange={event=>setValues(current=>({...current,subject:event.target.value}))}/>
      <textarea required minLength={10} maxLength={5000} rows={5} className={`${field} md:col-span-2`} aria-label="Describe your issue" placeholder="Describe how we can help" value={values.message} onChange={event=>setValues(current=>({...current,message:event.target.value}))}/>
      {error&&<p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">{error}</p>}
      {result&&<p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800 md:col-span-2">{result.confirmationSent?`Ticket ${result.ticketId} submitted. A confirmation email was sent to you.`:`Ticket ${result.ticketId} reached support, but the confirmation email could not be sent.`}</p>}
      <button className={`${button} w-fit`} disabled={busy} data-action-tone="success">{busy?'Sending...':'Submit support request'}</button>
    </form>
  </section>;
}
