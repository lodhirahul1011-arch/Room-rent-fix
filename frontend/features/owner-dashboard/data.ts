import type { OwnerActivity, PendingAction, PropertyRecord, QuickAction, RentTrendRecord } from './types';

export const ownerProperties: PropertyRecord[] = [];

export const ownerRentTrend: RentTrendRecord[] = [];

export const ownerPendingActions: PendingAction[] = [];

export const ownerActivities: OwnerActivity[] = [];

export const ownerQuickActions: QuickAction[] = [
  { label: 'Add property', detail: 'Create a new property record', icon: 'property', href: '/owner/properties', status: 'available' },
  { label: 'Add room', detail: 'Add a room to your portfolio', icon: 'room', href: '/owner/rooms', status: 'coming-soon' },
  { label: 'Register tenant', detail: 'Start a new enrollment', icon: 'tenant', href: '/owner/enrollments', status: 'coming-soon' },
  { label: 'Generate invoice', detail: 'Prepare the next rent cycle', icon: 'invoice', href: '/owner/invoices', status: 'coming-soon' },
  { label: 'Record payment', detail: 'Enter an offline payment', icon: 'payment', href: '/owner/payments', status: 'coming-soon' },
  { label: 'View ledger', detail: 'Review your financial history', icon: 'ledger', href: '/owner/ledger', status: 'coming-soon' },
];
