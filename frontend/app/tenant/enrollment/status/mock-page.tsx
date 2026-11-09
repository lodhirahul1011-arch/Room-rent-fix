import {Suspense} from 'react';
import { RoomRentShell } from '@/components/roomrent-shell';
import { PortfolioProvider } from '@/features/property-management/store';
import { EnrollmentStatusPage } from '@/features/enrollment/enrollment-page';
export default function Page(){return <RoomRentShell role="tenant"><PortfolioProvider><Suspense fallback={<p>Loading application status…</p>}><EnrollmentStatusPage/></Suspense></PortfolioProvider></RoomRentShell>}
