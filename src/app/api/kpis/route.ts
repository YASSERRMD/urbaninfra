import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { cache, CacheKeys } from '@/lib/cache';

// GET - Dashboard KPIs
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = user.tenantId;

    // Try cache first
    const cacheKey = `kpis:${tenantId}:dashboard`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, kpis: cached });
    }

    // Calculate KPIs
    const [
      totalAssets,
      assetsByType,
      assetsByStatus,
      riskDistribution,
      avgCondition,
      totalReplacementCost,
      recentSimulations,
      maintenanceBacklog,
    ] = await Promise.all([
      // Total assets
      db.asset.count({ where: { tenantId } }),
      
      // Assets by type
      db.asset.groupBy({
        by: ['type'],
        where: { tenantId },
        _count: true,
      }),
      
      // Assets by status
      db.asset.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      
      // Risk distribution (based on current condition)
      db.asset.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
        _avg: { currentCondition: true },
      }),
      
      // Average condition
      db.asset.aggregate({
        where: { tenantId },
        _avg: { currentCondition: true, degradationScore: true },
      }),
      
      // Total replacement cost
      db.asset.aggregate({
        where: { tenantId },
        _sum: { replacementCost: true },
      }),
      
      // Recent simulations
      db.simulationRun.count({
        where: {
          user: { tenantId },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      
      // Assets needing maintenance
      db.asset.count({
        where: {
          tenantId,
          OR: [
            { currentCondition: { lt: 60 } },
            { status: 'at_risk' },
            { status: 'critical' },
          ],
        },
      }),
    ]);

    // Calculate 5-year failure forecast
    const criticalAssets = await db.asset.findMany({
      where: {
        tenantId,
        OR: [{ status: 'critical' }, { currentCondition: { lt: 40 } }],
      },
      select: {
        id: true,
        name: true,
        currentCondition: true,
        replacementCost: true,
        simulations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            results: {
              where: { riskLevel: 'critical' },
              orderBy: { month: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    const failureForecast = {
      year1: criticalAssets.length,
      year2: Math.floor(criticalAssets.length * 1.3),
      year3: Math.floor(criticalAssets.length * 1.6),
      year4: Math.floor(criticalAssets.length * 2.0),
      year5: Math.floor(criticalAssets.length * 2.5),
    };

    // Calculate estimated maintenance budget
    const assetsNeedingAttention = await db.asset.findMany({
      where: {
        tenantId,
        currentCondition: { lt: 70 },
      },
      select: { currentCondition: true, replacementCost: true },
    });

    const estimatedMaintenanceBudget = assetsNeedingAttention.reduce((sum, asset) => {
      if (asset.currentCondition < 40) {
        return sum + asset.replacementCost * 0.3; // Major repair
      } else if (asset.currentCondition < 60) {
        return sum + asset.replacementCost * 0.1; // Moderate repair
      } else {
        return sum + asset.replacementCost * 0.02; // Routine
      }
    }, 0);

    const kpis = {
      totalAssets,
      assetsByType: assetsByType.map((t) => ({ type: t.type, count: t._count })),
      assetsByStatus: assetsByStatus.map((s) => ({ status: s.status, count: s._count })),
      riskDistribution: {
        critical: riskDistribution.filter((r) => r.status === 'critical').reduce((sum, r) => sum + r._count, 0),
        atRisk: riskDistribution.filter((r) => r.status === 'at_risk').reduce((sum, r) => sum + r._count, 0),
        operational: riskDistribution.filter((r) => r.status === 'operational').reduce((sum, r) => sum + r._count, 0),
      },
      avgCondition: avgCondition._avg.currentCondition || 0,
      avgDegradation: avgCondition._avg.degradationScore || 0,
      totalReplacementCost: totalReplacementCost._sum.replacementCost || 0,
      recentSimulations,
      maintenanceBacklog,
      estimatedMaintenanceBudget,
      failureForecast,
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, kpis, 300);

    return NextResponse.json({ success: true, kpis });
  } catch (error) {
    console.error('KPIs error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
