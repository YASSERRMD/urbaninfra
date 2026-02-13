import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, createAuditLog, PERMISSIONS, hasPermission } from '@/lib/auth';
import { cache, CacheKeys } from '@/lib/cache';

// GET - Get single asset
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
    const cacheKey = CacheKeys.asset(id);
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, asset: cached });
    }

    const asset = await db.asset.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
      },
      include: {
        maintenanceRecords: {
          orderBy: { startDate: 'desc' },
          take: 5,
        },
        simulations: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        riskAssessments: {
          orderBy: { assessmentDate: 'desc' },
          take: 3,
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    const formattedAsset = {
      ...asset,
      installationDate: asset.installationDate.toISOString(),
      lastMaintenanceDate: asset.lastMaintenanceDate?.toISOString(),
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      maintenanceRecords: asset.maintenanceRecords.map((m) => ({
        ...m,
        startDate: m.startDate.toISOString(),
        endDate: m.endDate?.toISOString(),
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      simulations: asset.simulations.map((s) => ({
        ...s,
        startedAt: s.startedAt?.toISOString(),
        completedAt: s.completedAt?.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      riskAssessments: asset.riskAssessments.map((r) => ({
        ...r,
        assessmentDate: r.assessmentDate.toISOString(),
        failureWindowStart: r.failureWindowStart?.toISOString(),
        failureWindowEnd: r.failureWindowEnd?.toISOString(),
        nextInspectionDate: r.nextInspectionDate?.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };

    await cache.set(cacheKey, formattedAsset, 60);

    return NextResponse.json({ success: true, asset: formattedAsset });
  } catch (error) {
    console.error('Get asset error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update asset
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, PERMISSIONS.UPDATE_ASSET)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const existingAsset = await db.asset.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Update asset
    const updateData: Record<string, unknown> = {};
    
    const allowedFields = [
      'name', 'type', 'material', 'expectedLifespan', 'trafficLoad',
      'humidityIndex', 'salinityIndex', 'temperatureIndex', 'maintenanceFreq',
      'lastMaintenanceDate', 'latitude', 'longitude', 'location',
      'currentCondition', 'degradationScore', 'status', 'replacementCost', 'metadata',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'lastMaintenanceDate') {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else if (field === 'metadata') {
          updateData[field] = body[field] ? JSON.stringify(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const asset = await db.asset.update({
      where: { id },
      data: updateData,
    });

    // Create audit log
    await createAuditLog(user.id, 'UPDATE', 'Asset', id, existingAsset, asset);

    // Invalidate caches
    await cache.delete(CacheKeys.asset(id));
    await cache.deletePattern(`assets:${user.tenantId}:*`);
    await cache.deletePattern(`kpi:${user.tenantId}:*`);

    return NextResponse.json({
      success: true,
      asset: {
        ...asset,
        installationDate: asset.installationDate.toISOString(),
        lastMaintenanceDate: asset.lastMaintenanceDate?.toISOString(),
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Update asset error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete asset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, PERMISSIONS.DELETE_ASSET)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingAsset = await db.asset.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { success: false, error: 'Asset not found' },
        { status: 404 }
      );
    }

    // Delete related records first
    await db.simulationResult.deleteMany({
      where: { simulation: { assetId: id } },
    });
    await db.simulationRun.deleteMany({ where: { assetId: id } });
    await db.maintenanceRecord.deleteMany({ where: { assetId: id } });
    await db.riskAssessment.deleteMany({ where: { assetId: id } });
    await db.asset.delete({ where: { id } });

    // Create audit log
    await createAuditLog(user.id, 'DELETE', 'Asset', id, existingAsset);

    // Invalidate caches
    await cache.delete(CacheKeys.asset(id));
    await cache.deletePattern(`assets:${user.tenantId}:*`);
    await cache.deletePattern(`kpi:${user.tenantId}:*`);

    return NextResponse.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    console.error('Delete asset error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
