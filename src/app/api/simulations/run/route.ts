import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, createAuditLog, PERMISSIONS, hasPermission } from '@/lib/auth';
import { 
  runSimulation, 
  SimulationConfig, 
  calculateFailureWindow, 
  calculateCostImpact 
} from '@/lib/simulation/engine';
import { cache } from '@/lib/cache';

// POST - Run a new simulation
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, PERMISSIONS.RUN_SIMULATION)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      assetId,
      name,
      description,
      yearsToSimulate = 5,
      scenarioType = 'standard',
      customParams,
      comparisonId,
    } = body;

    if (!assetId) {
      return NextResponse.json(
        { success: false, error: 'Asset ID is required' },
        { status: 400 }
      );
    }

    // Verify asset exists and belongs to user's tenant
    const asset = await db.asset.findFirst({
      where: { id: assetId, tenantId: user.tenantId },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Create simulation run record
    const simulationRun = await db.simulationRun.create({
      data: {
        assetId,
        userId: user.id,
        name: name || `Simulation - ${asset.name}`,
        description,
        yearsToSimulate,
        scenarioType,
        customParams: customParams ? JSON.stringify(customParams) : null,
        status: 'running',
        startedAt: new Date(),
        comparisonId,
      },
    });

    try {
      // Run the simulation
      const config: SimulationConfig = {
        assetId,
        yearsToSimulate,
        scenarioType,
        customParams,
      };

      const results = await runSimulation(config);

      // Store results
      await db.simulationResult.createMany({
        data: results.map((r) => ({
          simulationId: simulationRun.id,
          month: r.month,
          year: r.year,
          conditionScore: r.conditionScore,
          degradationScore: r.degradationScore,
          failureProbability: r.failureProbability,
          riskLevel: r.riskLevel,
          maintenanceCost: r.maintenanceCost,
        })),
      });

      // Calculate additional metrics
      const failureWindow = calculateFailureWindow(results);
      const costImpact = calculateCostImpact(asset, results);

      // Update simulation run as completed
      const completedRun = await db.simulationRun.update({
        where: { id: simulationRun.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Create risk assessment if critical
      const criticalResults = results.filter((r) => r.riskLevel === 'critical');
      if (criticalResults.length > 0) {
        await db.riskAssessment.create({
          data: {
            assetId,
            overallRiskScore: 100 - results[0].conditionScore,
            structuralRisk: 100 - results[0].conditionScore * 0.6,
            environmentalRisk: asset.humidityIndex * 100 + asset.salinityIndex * 100,
            operationalRisk: asset.trafficLoad,
            failureWindowStart: failureWindow?.start,
            failureWindowEnd: failureWindow?.end,
            estimatedFailureCost: costImpact.estimatedReplacementCost,
            recommendedActions: JSON.stringify([
              'Schedule immediate inspection',
              'Prepare maintenance budget allocation',
              'Consider asset replacement planning',
            ]),
            priorityRank: 1,
            nextInspectionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            assessorId: user.id,
          },
        });
      }

      // Create audit log
      await createAuditLog(user.id, 'SIMULATION_RUN', 'SimulationRun', simulationRun.id, null, {
        assetId,
        yearsToSimulate,
        scenarioType,
        resultCount: results.length,
      });

      // Invalidate cache
      await cache.delete(CacheKeys.simulation(simulationRun.id));
      await cache.delete(CacheKeys.asset(assetId));

      return NextResponse.json({
        success: true,
        simulation: {
          ...completedRun,
          startedAt: completedRun.startedAt?.toISOString(),
          completedAt: completedRun.completedAt?.toISOString(),
          createdAt: completedRun.createdAt.toISOString(),
          updatedAt: completedRun.updatedAt.toISOString(),
        },
        results: results.slice(0, 60), // First 5 years monthly
        summary: {
          totalMonths: results.length,
          finalCondition: results[results.length - 1]?.conditionScore || 0,
          failureWindow,
          costImpact,
          criticalMonths: criticalResults.length,
        },
      });
    } catch (simError) {
      // Update simulation as failed
      await db.simulationRun.update({
        where: { id: simulationRun.id },
        data: {
          status: 'failed',
          errorMessage: simError instanceof Error ? simError.message : 'Unknown error',
          completedAt: new Date(),
        },
      });

      throw simError;
    }
  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
