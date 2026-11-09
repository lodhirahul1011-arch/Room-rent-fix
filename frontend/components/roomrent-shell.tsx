'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, Building2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CreditCard, FileText, LayoutDashboard, LogOut, Menu, Moon, MoreHorizontal, Search, Settings, ShieldCheck, Sparkles, UserRound, Users, Wallet, X, Zap } from 'lucide-react';
import { dashboardData, roleMeta, type UserRole } from '@/lib/mock-data';
import { LIVE_MODE, currentSession,clearSession,request,type SessionInfo } from '@/services/live/api';
import { useEffect } from 'react';
import {NotificationBell} from '@/features/workspace/notification-bell';

const navByRole: Record<UserRole, Array<{ label: string; href: string; icon: typeof LayoutDashboard; badge?: string }>> = {
  admin: [
    { label: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Owners', href: '/admin/owners', icon: Users },
    { label: 'Properties', href: '/admin/properties', icon: Building2 },
    { label: 'Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
    { label: 'Approvals', href: '/admin/approvals', icon: ShieldCheck },
    { label: 'Reports', href: '/admin/reports', icon: FileText },
    { label: 'Support', href: '/admin/support', icon: CircleHelp },
  ],
  owner: [
    { label: 'Overview', href: '/owner/dashboard', icon: LayoutDashboard },
    { label: 'Properties', href: '/owner/properties', icon: Building2 },
    { label: 'Tenants', href: '/owner/tenants', icon: Users },
    { label: 'Enrollments', href: '/owner/enrollments', icon: ShieldCheck },
    { label: 'Tenancy history', href: '/owner/tenancies', icon: FileText },
    { label: 'Rent & billing', href: '/owner/invoices', icon: Wallet },
    { label: 'Verify payments', href: '/owner/payments', icon: CreditCard },
    { label: 'Digital khata', href: '/owner/ledger', icon: FileText },
    { label: 'Maintenance', href: '/owner/maintenance', icon: Settings },
    { label: 'Notifications', href: '/owner/notifications', icon: Bell },
    { label: 'Tenant documents', href: '/owner/documents', icon: FileText },
    { label: 'Deposits', href: '/owner/deposits', icon: Wallet },
    { label: 'Operations reports', href: '/owner/operations-reports', icon: FileText },
    { label: 'Reports', href: '/owner/reports', icon: FileText },
    { label: 'Sensitive approvals', href: '/owner/approvals', icon: ShieldCheck },
    { label: 'CCTV shortcuts', href: '/owner/cctv', icon: Building2 },
    { label: 'Property tablets', href: '/owner/devices', icon: Settings },
    { label: 'Help & support', href: '/support', icon: CircleHelp },
    { label: 'Calls (demo)', href: '/owner/calls', icon: CircleHelp },
  ],
  tenant: [
    { label: 'Overview', href: '/tenant/dashboard', icon: LayoutDashboard },
    { label: 'My room', href: '/tenant/my-room', icon: Building2 },
    { label: 'Apply for room', href: '/tenant/enrollment', icon: FileText },
    { label: 'Application status', href: '/tenant/enrollment/status', icon: ShieldCheck },
    { label: 'Invoices', href: '/tenant/invoices', icon: FileText },
    { label: 'Payments', href: '/tenant/payments', icon: Wallet },
    { label: 'Digital khata', href: '/tenant/ledger', icon: CreditCard },
    { label: 'Documents', href: '/tenant/documents', icon: FileText },
    { label: 'Deposits', href: '/tenant/deposits', icon: Wallet },
    { label: 'Notifications', href: '/tenant/notifications', icon: Bell },
    { label: 'Maintenance', href: '/tenant/maintenance', icon: Settings },
    { label: 'Help & support', href: '/support', icon: CircleHelp },
  ],
};

const roleLinks: Array<{ role: UserRole; href: string }> = [
  { role: 'admin', href: '/admin/dashboard' },
  { role: 'owner', href: '/owner/dashboard' },
  { role: 'tenant', href: '/tenant/dashboard' },
];

export function RoomRentShell({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [realSession,setRealSession]=useState<SessionInfo|null>(null);
  useEffect(()=>{if(!LIVE_MODE)return;const update=()=>setRealSession(currentSession());update();window.addEventListener('roomrent:auth',update);return()=>window.removeEventListener('roomrent:auth',update)},[]);
  const signOut=async()=>{if(LIVE_MODE){try{await request('/api/auth/logout',{method:'POST'})}catch{}clearSession()}router.push('/login')};
  const meta = roleMeta[role];
  const data = dashboardData[role];

  return (
    <div className={dark ? 'dark min-h-screen bg-[#111817]' : 'min-h-screen bg-[#f7f9f8]'}>
      <div className="flex min-h-screen text-[#16211e] dark:text-[#edf5f1]">
        <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${collapsed ? 'lg:w-[88px]' : 'lg:w-[256px]'} fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[#dce7e2] bg-[#fbfcfb] transition-all duration-300 dark:border-[#2b3c37] dark:bg-[#17211f]`}>
          <div className="flex h-20 items-center justify-between px-5">
            <Link href={`/${role}/dashboard`} className={`${collapsed ? 'lg:justify-center' : ''} flex items-center gap-3`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f766e] text-white shadow-lg shadow-teal-900/10"><Building2 className="h-5 w-5" /></span>
              <span className={`${collapsed ? 'lg:hidden' : ''} text-xl font-semibold tracking-[-0.04em]`}>Room<span className="text-[#0f766e]">Rent</span></span>
            </Link>
            <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[#62716c] hover:bg-[#edf4f1] lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
          </div>
          <div className={`${collapsed ? 'lg:px-3' : 'px-5'} pb-6`}>
            <div className={`${collapsed ? 'lg:justify-center' : ''} flex items-center gap-3 rounded-xl border border-[#e1ebe7] bg-white p-3 dark:border-[#2b3c37] dark:bg-[#1d2926]`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d8eeea] text-xs font-bold text-[#0f766e]">{LIVE_MODE?(realSession?.user?.name?.slice(0,2).toUpperCase()||'RR'):meta.initials}</span>
              <div className={`${collapsed ? 'lg:hidden' : ''} min-w-0`}><p className="truncate text-sm font-semibold">{meta.workspace}</p><p className="mt-0.5 text-xs text-[#70807a]">{LIVE_MODE?(realSession?.role||role):meta.label}</p></div>
              <ChevronDown className={`${collapsed ? 'lg:hidden' : ''} ml-auto h-4 w-4 text-[#82918c]`} />
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
            <p className={`${collapsed ? 'lg:hidden' : ''} px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#94a39e]`}>Workspace</p>
            {navByRole[role].map((item) => { const Icon = item.icon; const active = pathname === item.href || (item.href !== `/${role}/dashboard` && pathname.startsWith(item.href)); return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`${active ? 'bg-[#e1f1ed] font-semibold text-[#0b665e] dark:bg-[#21433d] dark:text-[#b9eee4]' : 'text-[#61716b] hover:bg-[#eff5f2] hover:text-[#16211e] dark:text-[#aebdb7] dark:hover:bg-[#21312d]'} ${collapsed ? 'lg:justify-center lg:px-3' : ''} group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors`}><Icon className="h-[18px] w-[18px] shrink-0" /><span className={`${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>{item.badge && <span className={`${collapsed ? 'lg:hidden' : ''} ml-auto rounded-full bg-[#f0f4f2] px-2 py-0.5 text-[10px] font-bold text-[#70807a] dark:bg-[#2a3c37]`}>{item.badge}</span>}</Link>; })}
            <p className={`${collapsed ? 'lg:hidden' : ''} px-3 pb-2 pt-8 text-[10px] font-bold uppercase tracking-[0.16em] text-[#94a39e]`}>Account</p>
            <Link href={`/${role}/settings`} className={`${collapsed ? 'lg:justify-center lg:px-3' : ''} flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#61716b] transition-colors hover:bg-[#eff5f2]`}><Settings className="h-[18px] w-[18px]" /><span className={`${collapsed ? 'lg:hidden' : ''}`}>Settings</span></Link>
            <button onClick={() => setDark(!dark)} className={`${collapsed ? 'lg:justify-center lg:px-3' : ''} flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-[#61716b] transition-colors hover:bg-[#eff5f2]`}><Moon className="h-[18px] w-[18px]" /><span className={`${collapsed ? 'lg:hidden' : ''}`}>{dark ? 'Light mode' : 'Dark mode'}</span></button>
          </nav>
          <div className={`${collapsed ? 'lg:p-3' : 'p-5'} mt-auto`}><div className={`${collapsed ? 'lg:justify-center lg:p-2' : 'p-4'} rounded-2xl bg-[#0f766e] text-white`}><Sparkles className="mb-3 h-5 w-5 text-[#9de6dc]" /><p className={`${collapsed ? 'lg:hidden' : ''} text-sm font-semibold`}>RoomRent Pro</p><p className={`${collapsed ? 'lg:hidden' : ''} mt-1 text-xs leading-5 text-[#c7eeea]`}>Everything you need to run a better rental business.</p><button className={`${collapsed ? 'lg:hidden' : ''} mt-4 flex items-center gap-1 text-xs font-bold text-white`}>Explore plan <ChevronRight className="h-3.5 w-3.5" /></button></div></div>
        </aside>
        {mobileOpen && <button className="fixed inset-0 z-30 bg-[#10211d]/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />}
        <main className={`${collapsed ? 'lg:pl-[88px]' : 'lg:pl-[256px]'} min-w-0 flex-1 transition-all duration-300`}>
          <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e2ebe7]/90 bg-[#f7f9f8]/90 px-5 backdrop-blur-xl dark:border-[#2b3c37] dark:bg-[#111817]/90 sm:px-8"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#53635d] hover:bg-[#e9f1ee] lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button><button onClick={() => setCollapsed(!collapsed)} className="hidden rounded-lg p-2 text-[#53635d] hover:bg-[#e9f1ee] lg:block" aria-label="Collapse navigation">{collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}</button><div className="relative hidden sm:block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#97a59f]" /><input className="h-10 w-64 rounded-xl border border-transparent bg-white pl-10 pr-3 text-sm outline-none ring-0 placeholder:text-[#a5b1ad] focus:border-[#b9dcd6] dark:bg-[#1d2926]" placeholder="Search anything..." aria-label="Search" disabled={LIVE_MODE} title={LIVE_MODE?"Global search is not yet connected to the API":undefined} /></div></div><div className="flex items-center gap-2 sm:gap-4"><NotificationBell role={role}/><div className="relative"><button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-[#e9f1ee]" aria-expanded={profileOpen}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d8eeea] text-xs font-bold text-[#0f766e]">{LIVE_MODE?(realSession?.user?.name?.slice(0,2).toUpperCase()||'RR'):meta.initials}</span><span className="hidden text-left sm:block"><span className="block text-sm font-semibold">{LIVE_MODE?(realSession?.user?.name||'RoomRent'):meta.name}</span><span className="block text-xs text-[#81918b]">{LIVE_MODE?(realSession?.role||role):meta.label}</span></span><ChevronDown className="hidden h-4 w-4 text-[#879590] sm:block" /></button>{profileOpen && <div className="absolute right-0 top-14 w-56 rounded-2xl border border-[#dfebe6] bg-white p-2 shadow-xl dark:border-[#33453f] dark:bg-[#1b2925]"><p className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-[#94a39e]">Switch workspace</p>{!LIVE_MODE&&roleLinks.map((link) => <button key={link.role} onClick={() => { router.push(link.href); setProfileOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[#eff5f2]"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e1f1ed] text-[10px] font-bold text-[#0f766e]">{roleMeta[link.role].initials}</span>{roleMeta[link.role].label}</button>)}<div className="my-1 border-t border-[#edf2ef]" /><button onClick={()=>void signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#8b5a56] hover:bg-[#fff1ef]"><LogOut className="h-4 w-4" />Sign out</button></div>}</div></div></header>
          <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function DashboardView({ role }: { role: UserRole }) {
  const data = dashboardData[role];
  return <RoomRentShell role={role}><div className="animate-fade-up"><div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#0f766e]">{data.eyebrow}</p><h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#17241f] dark:text-white sm:text-4xl">{data.title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#6d7d76] dark:text-[#aab9b3]">{data.description}</p></div><button className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-5 text-sm font-semibold text-white shadow-lg shadow-teal-900/10 transition hover:-translate-y-0.5 hover:bg-[#0a655e]"><Zap className="h-4 w-4" />Quick action</button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.stats.map((stat) => <StatCard key={stat.label} stat={stat} />)}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]"><section className="rounded-2xl border border-[#e1ebe7] bg-white p-5 shadow-[0_8px_30px_rgba(29,66,54,0.04)] dark:border-[#2b3c37] dark:bg-[#17211f] sm:p-6"><div className="mb-6 flex items-center justify-between"><div><h2 className="font-semibold tracking-[-0.02em]">Portfolio overview</h2><p className="mt-1 text-xs text-[#82918b]">Performance across your workspace</p></div><button className="rounded-lg p-2 text-[#82918b] hover:bg-[#edf4f1]"><MoreHorizontal className="h-5 w-5" /></button></div><div className="flex h-56 items-end gap-2 border-b border-l border-[#e7efec] px-2 pb-0 pt-8 sm:gap-4"><div className="pointer-events-none absolute ml-4 hidden h-44 w-[48%] flex-col justify-between text-[10px] text-[#a4b0ab] sm:flex"><span>No rent records yet</span></div>{[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((height, index) => <div key={index} className="group relative flex h-full flex-1 items-end"><div className={`${index > 8 ? 'bg-[#0f766e]' : 'bg-[#bfe5de]'} w-full rounded-t-md transition-all duration-500 hover:bg-[#0f766e]`} style={{ height: `${height}%` }} /><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-[#a4b0ab]">{['N','D','J','F','M','A','M','J','J','A','S','O'][index]}</span></div>)}</div><div className="mt-10 flex gap-5 text-xs text-[#71817a]"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#0f766e]" />Collected</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#bfe5de]" />Expected</span></div></section><section className="rounded-2xl border border-[#e1ebe7] bg-white p-5 shadow-[0_8px_30px_rgba(29,66,54,0.04)] dark:border-[#2b3c37] dark:bg-[#17211f] sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold tracking-[-0.02em]">Recent activity</h2><p className="mt-1 text-xs text-[#82918b]">Your latest updates</p></div><button className="text-xs font-semibold text-[#0f766e] hover:underline">View all</button></div><div className="space-y-5">{data.activities.length===0&&<p className="py-5 text-sm text-[#82918b]">No activity yet.</p>}{data.activities.map((activity) => <div key={activity.title} className="flex gap-3"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activity.tone === 'green' ? 'bg-[#2a9d78]' : activity.tone === 'amber' ? 'bg-[#e5a83e]' : activity.tone === 'blue' ? 'bg-[#3b82b5]' : 'bg-[#91a39b]'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{activity.title}</p><p className="mt-0.5 truncate text-xs text-[#82918b]">{activity.detail}</p></div><span className="whitespace-nowrap text-[11px] text-[#9aa8a3]">{activity.time}</span></div>)}</div></section></div><section className="mt-6 rounded-2xl border border-[#cde5df] bg-[#eaf6f3] p-5 dark:border-[#2b5550] dark:bg-[#1d3632] sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c9e9e2] text-[#0f766e]"><ShieldCheck className="h-5 w-5" /></div><div className="flex-1"><p className="text-sm font-semibold text-[#155b53] dark:text-[#c2eee6]">Keep your records audit-ready</p><p className="mt-1 text-xs leading-5 text-[#4c7770] dark:text-[#a9d3cc]">RoomRent keeps every payment, approval, and maintenance update connected to the right home and person.</p></div><button className="whitespace-nowrap rounded-lg border border-[#9ed4ca] bg-white px-4 py-2.5 text-xs font-semibold text-[#0f766e] hover:bg-[#f6fffd] dark:bg-transparent">Learn more</button></div></section></div></RoomRentShell>;
}

function StatCard({ stat }: { stat: { label: string; value: string; change: string; tone: string } }) { const colors: Record<string, string> = { blue: 'bg-[#e2f0f8] text-[#31749c]', green: 'bg-[#e1f3ec] text-[#2a906c]', amber: 'bg-[#fff1d8] text-[#ae7725]', red: 'bg-[#ffebe7] text-[#bd6256]' }; return <div className="rounded-2xl border border-[#e1ebe7] bg-white p-5 shadow-[0_8px_30px_rgba(29,66,54,0.04)] dark:border-[#2b3c37] dark:bg-[#17211f]"><div className="flex items-start justify-between"><p className="text-xs font-medium text-[#71817a]">{stat.label}</p><span className={`${colors[stat.tone]} rounded-lg px-2 py-1 text-[10px] font-bold`}>{stat.tone === 'red' ? '!' : '↗'}</span></div><p className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{stat.value}</p><p className="mt-2 text-[11px] text-[#81918b]">{stat.change}</p></div>; }
