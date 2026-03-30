/**
 * MERGE into getAnalyticsData() in api.ts after claims table has settlement_amount.
 * Uses Supabase client; adjust table/column names if yours differ.
 */

// Inside getAnalyticsData, after other aggregates:
/*
  const { data: settledRows } = await supabase
    .from("claims")
    .select("settlement_amount")
    .not("settlement_amount", "is", null);

  let totalSettledAmount = 0;
  let totalClaimsWithSettlement = 0;
  for (const row of settledRows ?? []) {
    const v = Number((row as { settlement_amount?: string | number }).settlement_amount);
    if (!Number.isNaN(v) && v !== 0) {
      totalSettledAmount += v;
      totalClaimsWithSettlement += 1;
    }
  }

  return {
    ...existing,
    totalSettledAmount,
    totalClaimsWithSettlement,
  };
*/

// Extend AnalyticsData type:
/*
export type AnalyticsData = {
  // ...existing
  totalSettledAmount?: number;
  totalClaimsWithSettlement?: number;
};
*/

export {};
