import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, PERMISSIONS, hasPermission } from '@/lib/auth';
import { cache } from '@/lib/cache';

// GET - Get all reports
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const reports = await db.report.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      reports: reports.map((r) => ({
        ...r,
        generatedAt: r.generatedAt?.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Generate a new report
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, PERMISSIONS.GENERATE_REPORTS)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, type, parameters } = body;

    let reportData: Record<string, unknown> = {};

    // Generate report based on type
    switch (type) {
      case 'summary':
        reportData = await generateSummaryReport(user.tenantId);
        break;
      case 'risk':
        reportData = await generateRiskReport(user.tenantId);
        break;
      case 'financial':
        reportData = await generateFinancialReport(user.tenantId);
        break;
      case 'simulation':
        if (parameters?.simulationId) {
          reportData = await generateSimulationReport(parameters.simulationId, user.tenantId);
        }
        break;
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid report type' },
          { status: 400 }
        );
    }

    const report = await db.report.create({
      data: {
        tenantId: user.tenantId,
        name: name || `${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${new Date().toLocaleDateString()}`,
        type,
        parameters: JSON.stringify(parameters || {}),
        content: JSON.stringify(reportData),
        generatedAt: new Date(),
        generatedBy: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      report: {
        ...report,
        generatedAt: report.generatedAt?.toISOString(),
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
        data: reportData,
      },
    });
  } catch (error) {
    console.error('Generate report error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function generateSummaryReport(tenantId: string) {
  const [totalAssets, assetsByType, assetsByStatus, avgCondition, totalValue] = await Promise.all([
    db.asset.count({ where: { tenantId } }),
    db.asset.groupBy({ by: ['type'], where: { tenantId }, _count: true }),
    db.asset.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
    db.asset.aggregate({ where: { tenantId }, _avg: { currentCondition: true } }),
    db.asset.aggregate({ where: { tenantId }, _sum: { replacementCost: true } }),
  ]);

  return {
    title: 'Infrastructure Summary Report',
    generatedAt: new Date().toISOString(),
    summary: {
      totalAssets,
      averageCondition: avgCondition._avg.currentCondition || 0,
      totalReplacementValue: totalValue._sum.replacementCost || 0,
    },
    breakdown: {
      byType: assetsByType.map((t) => ({ type: t.type, count: t._count })),
      byStatus: assetsByStatus.map((s) => ({ status: s.status, count: s._count })),
    },
  };
}

async function generateRiskReport(tenantId: string) {
  const atRiskAssets = await db.asset.findMany({
    where: {
      tenantId,
      OR: [{ status: 'at_risk' }, { status: 'critical' }, { currentCondition: { lt: 50 } }],
    },
    include: {
      riskAssessments: { orderBy: { assessmentDate: 'desc' }, take: 1 },
    },
  });

  const riskSummary = {
    critical: atRiskAssets.filter((a) => a.currentCondition < 30).length,
    high: atRiskAssets.filter((a) => a.currentCondition >= 30 && a.currentCondition < 50).length,
    moderate: atRiskAssets.filter((a) => a.currentCondition >= 50 && a.currentCondition < 70).length,
  };

  return {
    title: 'Risk Assessment Report',
    generatedAt: new Date().toISOString(),
    riskSummary,
    atRiskAssets: atRiskAssets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currentCondition: a.currentCondition,
      status: a.status,
      location: a.location,
      latestRiskAssessment: a.riskAssessments[0] || null,
    })),
    recommendations: [
      'Prioritize assets with condition score below 40 for immediate maintenance',
      'Schedule inspections for all critical status assets within 30 days',
      'Develop replacement plan for assets approaching end of expected lifespan',
    ],
  };
}

async function generateFinancialReport(tenantId: string) {
  const assets = await db.asset.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      type: true,
      currentCondition: true,
      replacementCost: true,
      maintenanceRecords: {
        select: { cost: true, type: true, startDate: true },
        orderBy: { startDate: 'desc' },
        take: 5,
      },
    },
  });

  const totalValue = assets.reduce((sum, a) => sum + a.replacementCost, 0);
  const maintenanceLastYear = assets.reduce((sum, a) => {
    return sum + a.maintenanceRecords
      .filter((m) => new Date(m.startDate) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))
      .reduce((msum, m) => msum + m.cost, 0);
  }, 0);

  const projectedCosts = assets.reduce((sum, a) => {
    if (a.currentCondition < 40) return sum + a.replacementCost * 0.3;
    if (a.currentCondition < 60) return sum + a.replacementCost * 0.1;
    if (a.currentCondition < 80) return sum + a.replacementCost * 0.02;
    return sum;
  }, 0);

  return {
    title: 'Financial Impact Report',
    generatedAt: new Date().toISOString(),
    financialSummary: {
      totalAssetValue: totalValue,
      maintenanceLastYear,
      projectedAnnualMaintenance: projectedCosts,
    },
    costBreakdown: {
      byType: Object.entries(
        assets.reduce((acc, a) => {
          acc[a.type] = (acc[a.type] || 0) + a.replacementCost;
          return acc;
        }, {} as Record<string, number>)
      ).map(([type, value]) => ({ type, value })),
    },
    budgetRecommendations: [
      `Allocate ${Math.round(projectedCosts * 1.2).toLocaleString()} for annual maintenance budget`,
      'Reserve 20% contingency for emergency repairs',
      'Plan capital improvements for assets below 50% condition',
    ],
  };
}

async function generateSimulationReport(simulationId: string, tenantId: string) {
  const simulation = await db.simulationRun.findFirst({
    where: { id: simulationId, user: { tenantId } },
    include: {
      asset: true,
      results: { orderBy: { month: 'asc' } },
    },
  });

  if (!simulation) {
    throw new Error('Simulation not found');
  }

  const yearlyAverages = simulation.results.reduce((acc, r) => {
    if (!acc[r.year]) {
      acc[r.year] = { conditionSum: 0, count: 0, failureProbSum: 0 };
    }
    acc[r.year].conditionSum += r.conditionScore;
    acc[r.year].failureProbSum += r.failureProbability;
    acc[r.year].count++;
    return acc;
  }, {} as Record<number, { conditionSum: number; count: number; failureProbSum: number }>);

  return {
    title: 'Simulation Analysis Report',
    generatedAt: new Date().toISOString(),
    simulationInfo: {
      name: simulation.name,
      asset: simulation.asset.name,
      scenarioType: simulation.scenarioType,
      yearsSimulated: simulation.yearsToSimulate,
      runAt: simulation.createdAt.toISOString(),
    },
    yearlySummary: Object.entries(yearlyAverages).map(([year, data]) => ({
      year: parseInt(year),
      avgCondition: data.conditionSum / data.count,
      avgFailureProbability: data.failureProbSum / data.count,
    })),
    riskTimeline: simulation.results
      .filter((r) => r.riskLevel === 'high' || r.riskLevel === 'critical')
      .map((r) => ({
        month: r.month,
        year: r.year,
        riskLevel: r.riskLevel,
        conditionScore: r.conditionScore,
      })),
    recommendations: generateSimulationRecommendations(simulation.results),
  };
}

function generateSimulationRecommendations(results: { riskLevel: string; conditionScore: number; month: number }[]) {
  const recommendations: string[] = [];
  
  const criticalMonths = results.filter((r) => r.riskLevel === 'critical');
  if (criticalMonths.length > 0) {
    recommendations.push(`Asset reaches critical state at month ${criticalMonths[0].month}. Plan intervention before this point.`);
  }

  const firstHighRisk = results.find((r) => r.riskLevel === 'high');
  if (firstHighRisk) {
    recommendations.push(`Schedule comprehensive inspection by month ${Math.max(1, firstHighRisk.month - 6)}.`);
  }

  recommendations.push('Review maintenance schedule and consider increasing frequency if degradation rate is high.');
  recommendations.push('Evaluate cost-benefit of early replacement vs. continued maintenance.');

  return recommendations;
}
