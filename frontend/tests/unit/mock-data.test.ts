import { describe, expect, it } from 'vitest';
import { dashboardData, formatINR } from '@/lib/mock-data';
import { ownerProperties, ownerRentTrend, ownerQuickActions } from '@/features/owner-dashboard/data';
import { calculateOwnerSummary } from '@/features/owner-dashboard/utils';

describe('RoomRent mock data', () => {
  it('has a dashboard for every role', () => {
    expect(Object.keys(dashboardData)).toEqual(expect.arrayContaining(['admin', 'owner', 'tenant']));
  });

  it('formats Indian currency', () => {
    expect(formatINR(18500)).toContain('18,500');
  });

  it('starts owner totals without sample records', () => {
    const summary = calculateOwnerSummary(ownerProperties, ownerRentTrend);
    expect(summary.totalRooms).toBe(0);
    expect(summary.occupiedRooms).toBe(0);
    expect(summary.vacantRooms).toBe(0);
    expect(summary.activeTenants).toBe(summary.occupiedRooms);
    expect(summary.expectedRent).toBe(0);
    expect(summary.collectedRent).toBe(0);
    expect(summary.overdueRent).toBe(0);
    expect(summary.pendingRent).toBe(0);
  });

  it('keeps every quick action connected to a destination', () => {
    expect(ownerQuickActions.every((action) => action.status === 'coming-soon' || Boolean(action.href))).toBe(true);
  });
});
