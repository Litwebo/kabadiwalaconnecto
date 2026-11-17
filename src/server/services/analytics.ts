import { getDb } from '../db.ts';

export interface AdminAnalyticsDTO {
  activeCollectors: number;
  verifiedRecyclers: number;
  pendingRecyclers: number;
  openDisputes: number;
  totalKgListed: number;
  totalKgCompleted: number;
  completedTransactions: number;
  avgSellingPricePerKg: number;
  percentMaterialToVerifiedRecyclers: number;
  repeatTransactionRate: number;
  avgTransportCostPerKg: number;
  totalCo2SavedKg: number;
  monthlySeries: { month: string; kg: number; netAmount: number; count: number }[];
}

export function getAdminAnalytics(): AdminAnalyticsDTO {
  const db = getDb();

  const activeCollectors = (
    db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE role = 'COLLECTOR' AND status = 'ACTIVE'`).get() as {
      cnt: number;
    }
  ).cnt;

  const verifiedRecyclers = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM recycler_profiles WHERE verification_status = 'APPROVED'`)
      .get() as { cnt: number }
  ).cnt;

  const pendingRecyclers = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM recycler_profiles WHERE verification_status = 'PENDING'`)
      .get() as { cnt: number }
  ).cnt;

  const openDisputes = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM disputes WHERE status IN ('OPEN', 'UNDER_REVIEW')`)
      .get() as { cnt: number }
  ).cnt;

  const totalKgListed = (
    db
      .prepare(
        `SELECT COALESCE(SUM(li.declared_kg), 0) as total
         FROM lot_items li
         JOIN lots l ON l.id = li.lot_id
         WHERE l.status IN ('LISTED', 'BOOKED', 'COMPLETED')`
      )
      .get() as { total: number }
  ).total;

  const ledgerAgg = db
    .prepare(
      `SELECT COUNT(*) as cnt,
              COALESCE(SUM(kg), 0) as total_kg,
              COALESCE(SUM(gross_amount), 0) as total_gross,
              COALESCE(SUM(transport_cost), 0) as total_transport,
              COALESCE(SUM(net_amount), 0) as total_net,
              COALESCE(SUM(co2_saved_kg), 0) as total_co2
       FROM ledger_entries`
    )
    .get() as {
    cnt: number;
    total_kg: number;
    total_gross: number;
    total_transport: number;
    total_net: number;
    total_co2: number;
  };

  const collectorTxCounts = db
    .prepare(`SELECT collector_id, COUNT(*) as cnt FROM ledger_entries GROUP BY collector_id`)
    .all() as { collector_id: string; cnt: number }[];

  const repeatCollectors = collectorTxCounts.filter((c) => c.cnt >= 2).length;
  const repeatTransactionRate =
    collectorTxCounts.length > 0 ? Math.round((repeatCollectors / collectorTxCounts.length) * 100) : 0;

  const avgSellingPricePerKg =
    ledgerAgg.total_kg > 0 ? Math.round((ledgerAgg.total_net / ledgerAgg.total_kg) * 100) / 100 : 0;

  const avgTransportCostPerKg =
    ledgerAgg.total_kg > 0 ? Math.round((ledgerAgg.total_transport / ledgerAgg.total_kg) * 100) / 100 : 0;

  const percentMaterialToVerifiedRecyclers =
    totalKgListed > 0 ? Math.min(100, Math.round((ledgerAgg.total_kg / totalKgListed) * 100)) : 0;

  const monthlyRows = db
    .prepare(
      `SELECT substr(date, 1, 7) as month,
              SUM(kg) as kg,
              SUM(net_amount) as net_amount,
              COUNT(*) as count
       FROM ledger_entries
       GROUP BY substr(date, 1, 7)
       ORDER BY month ASC`
    )
    .all() as { month: string; kg: number; net_amount: number; count: number }[];

  return {
    activeCollectors,
    verifiedRecyclers,
    pendingRecyclers,
    openDisputes,
    totalKgListed: Math.round(totalKgListed * 100) / 100,
    totalKgCompleted: Math.round(ledgerAgg.total_kg * 100) / 100,
    completedTransactions: ledgerAgg.cnt,
    avgSellingPricePerKg,
    percentMaterialToVerifiedRecyclers,
    repeatTransactionRate,
    avgTransportCostPerKg,
    totalCo2SavedKg: Math.round(ledgerAgg.total_co2 * 100) / 100,
    monthlySeries: monthlyRows.map((m) => ({
      month: m.month,
      kg: Math.round(Number(m.kg) * 100) / 100,
      netAmount: Math.round(Number(m.net_amount)),
      count: Number(m.count),
    })),
  };
}
