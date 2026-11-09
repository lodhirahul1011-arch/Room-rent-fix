import Link from 'next/link';
import {SupportTicketForm} from '@/features/support/support-ticket-form';

export default function SupportPage(){
  return <main className="min-h-screen bg-[#f7f9f8] px-4 py-10 text-[#16211e]">
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/" className="text-sm font-semibold text-teal-700">RoomRent</Link>
      <div><h1 className="text-3xl font-semibold tracking-tight">Help & support</h1><p className="mt-2 text-sm text-[#71817a]">Tell us what you need help with. We will email you a ticket reference.</p></div>
      <SupportTicketForm/>
    </div>
  </main>;
}
