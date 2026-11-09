/** Display-only calculation; the backend revalidates and posts every financial charge. */
export function previewMeterCharge(
  previous: number | undefined,
  current: number,
  rateRupees: number,
) {
  if (
    previous === undefined ||
    ![previous, current, rateRupees].every(Number.isFinite) ||
    previous < 0 ||
    rateRupees < 0
  )
    return { units: null, amountPaise: null };
  const p = Math.round(previous * 1000),
    c = Math.round(current * 1000),
    rate = Math.round(rateRupees * 100);
  if (
    ![p, c, rate].every(Number.isSafeInteger) ||
    Math.abs(previous * 1000 - p) > 0.000001 ||
    Math.abs(current * 1000 - c) > 0.000001 ||
    Math.abs(rateRupees * 100 - rate) > 0.000001
  )
    return { units: null, amountPaise: null };
  const units = (c - p) / 1000;
  if (c < p) return { units, amountPaise: null };
  const amountPaise = Number(
    ((BigInt(c) - BigInt(p)) * BigInt(rate) + BigInt(500)) / BigInt(1000),
  );
  return {
    units,
    amountPaise: Number.isSafeInteger(amountPaise) ? amountPaise : null,
  };
}
