export type UserRole = 'admin' | 'owner' | 'tenant';

export type DashboardStat = {
  label: string;
  value: string;
  change: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
};

export type ActivityItem = {
  title: string;
  detail: string;
  time: string;
  tone: 'blue' | 'green' | 'amber' | 'slate';
};

export const roleMeta: Record<UserRole, { label: string; name: string; initials: string; workspace: string }> = {
  admin: { label: 'Platform admin', name: 'Admin', initials: 'AD', workspace: 'RoomRent HQ' },
  owner: { label: 'Property owner', name: 'Owner', initials: 'OW', workspace: 'My properties' },
  tenant: { label: 'Tenant', name: 'Tenant', initials: 'TN', workspace: 'My tenancy' },
};

export const dashboardData: Record<UserRole, { eyebrow: string; title: string; description: string; stats: DashboardStat[]; activities: ActivityItem[] }> = {
  admin: {
    eyebrow: new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'long',year:'numeric'}),
    title: 'Welcome to RoomRent',
    description: 'Your workspace records and activity appear here as you add them.',
    stats: [
      { label: 'Active properties', value: '0', change: 'No records yet', tone: 'blue' },
      { label: 'Registered owners', value: '0', change: 'No records yet', tone: 'green' },
      { label: 'Monthly rent volume', value: '0', change: 'No records yet', tone: 'amber' },
      { label: 'Open approvals', value: '0', change: 'No records yet', tone: 'red' },
    ],
    activities: [],
  },
  owner: {
    eyebrow: new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'long',year:'numeric'}),
    title: 'Welcome to RoomRent',
    description: 'Your workspace records and activity appear here as you add them.',
    stats: [
      { label: 'Properties', value: '0', change: 'No records yet', tone: 'blue' },
      { label: 'Occupancy rate', value: '0', change: 'No records yet', tone: 'green' },
      { label: 'Rent collected', value: '0', change: 'No records yet', tone: 'amber' },
      { label: 'Pending actions', value: '0', change: 'No records yet', tone: 'red' },
    ],
    activities: [],
  },
  tenant: {
    eyebrow: new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'long',year:'numeric'}),
    title: 'Welcome to RoomRent',
    description: 'Your workspace records and activity appear here as you add them.',
    stats: [
      { label: 'Current rent', value: '0', change: 'No records yet', tone: 'blue' },
      { label: 'Payment status', value: '0', change: 'No records yet', tone: 'green' },
      { label: 'Room', value: '0', change: 'No records yet', tone: 'amber' },
      { label: 'Open requests', value: '0', change: 'No records yet', tone: 'red' },
    ],
    activities: [],
  },
};

export const formatINR = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
