import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { cache, CacheKeys } from '@/lib/cache';

// GET - Get single simulation with results
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Try cache
    const cacheKey = CacheKeys.simulation(id);
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, ...cached });
    }

    const simulation = await db.simulationRun.findFirst({
      where: {
        id,
        user: { tenantId: user.tenantId },
      },
      include: {
        asset: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        results: {
          orderBy: { month: 'asc' },
        },
      },
    });

    if (!simulation) {
      return NextResponse.json(
        { success: false, error: 'Simulation not found' },
        { status: 404 }
      );
    }

    const response = {
      simulation: {
        ...simulation,
        startedAt: simulation.startedAt?.toISOString(),
        completedAt: simulation.completedAt?.toISOString(),
        createdAt: simulation.createdAt.toISOString(),
        updatedAt: simulation.updatedAt.toISOString(),
        asset: {
          ...simulation.asset,
          installationDate: simulation.asset.installationDate.toISOString(),
          lastMaintenanceDate: simulation.asset.lastMaintenanceDate?.toISOString(),
          createdAt: simulation.asset.createdAt.toISOString(),
          updatedAt: simulation.asset.updatedAt.toISOString(),
        },
        results: simulation.results.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    };

    // Cache for 10 minutes
    await cache.set(cacheKey, response, 600);

    return NextResponse.json({ success: true, ...response });
  } catch (error) {
    console.error('Get simulation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete simulation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const simulation = await db.simulationRun.findFirst({
      where: {
        id,
        user: { tenantId: user.tenantId },
      },
    });

    if (!simulation) {
      return NextResponse.json(
        { success: false, error: 'Simulation not found' },
        { status: 404 }
      );
    }

    // Delete results first
    await db.simulationResult.deleteMany({ where: { simulationId: id } });
    await db.simulationRun.delete({ where: { id } });

    await cache.delete(CacheKeys.simulation(id));

    return NextResponse.json({ success: true, message: 'Simulation deleted' });
  } catch (error) {
    console.error('Delete simulation error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
