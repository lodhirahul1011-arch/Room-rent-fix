import { describe, expect, it } from 'vitest';
import { ownerProperties, ownerRentTrend } from '@/features/owner-dashboard/data';
import { calculateOwnerSummary } from '@/features/owner-dashboard/utils';

describe('Owner dashboard financial invariants', () => {
  it('reconciles property collections to the current monthly trend', () => {
    const properties=[{id:'test',name:'Test property',location:'Test location',rooms:2,occupiedRooms:1,expectedRent:1000,collectedRent:700}];
    const trend=[{month:'Nov',expected:1000,collected:700,pending:200,overdue:100}];
    const summary = calculateOwnerSummary(properties, trend);
    const current = trend.at(-1)!;
    expect(summary.expectedRent).toBe(current.expected);
    expect(summary.collectedRent).toBe(current.collected);
    expect(summary.pendingRent).toBe(summary.expectedRent - summary.collectedRent);
    expect(current.pending + current.overdue).toBe(summary.pendingRent);
  });
  it('handles empty properties without NaN or division errors', () => {
    const summary = calculateOwnerSummary([], []);
    expect(summary.totalProperties).toBe(0);
    expect(summary.occupancyRate).toBe(0);
    expect(summary.collectionRate).toBe(0);
    expect(summary.pendingRent).toBe(0);
  });
  it('never reports more occupied rooms than the property contains', () => {
    for (const property of ownerProperties) {
      expect(property.occupiedRooms).toBeGreaterThanOrEqual(0);
      expect(property.occupiedRooms).toBeLessThanOrEqual(property.rooms);
      expect(property.collectedRent).toBeLessThanOrEqual(property.expectedRent);
    }
  });
});
