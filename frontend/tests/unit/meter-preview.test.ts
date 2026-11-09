import { describe, it, expect } from "vitest";
import { previewMeterCharge } from "@/features/meters/preview";
describe("Electricity preview uses the backend rounding contract", () => {
  it("shows 130 units and INR 1300 for 1250 → 1380 at INR 10", () =>
    expect(previewMeterCharge(1250, 1380, 10)).toEqual({
      units: 130,
      amountPaise: 130000,
    }));
  it("rounds half-paise exactly instead of binary floating-point undercharging", () =>
    expect(previewMeterCharge(0, 1.035, 1)).toEqual({
      units: 1.035,
      amountPaise: 104,
    }));
  it("does not show a charge for a decreasing or invalid cumulative reading", () => {
    expect(previewMeterCharge(100, 99, 10).amountPaise).toBeNull();
    expect(previewMeterCharge(undefined, 99, 10).units).toBeNull();
    expect(previewMeterCharge(0, Infinity, 10).amountPaise).toBeNull();
  });
  it("supports a legitimate zero-consumption or zero-rate monthly reading", () => {
    expect(previewMeterCharge(10, 10, 10).amountPaise).toBe(0);
    expect(previewMeterCharge(10, 20, 0).amountPaise).toBe(0);
  });
});
