import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, createAuditLog, PERMISSIONS, hasPermission } from '@/lib/auth';
import { cache, CacheKeys } from '@/lib/cache';

// GET - List all assets with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const minCondition = searchParams.get('minCondition');
    const maxCondition = searchParams.get('maxCondition');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
    };

    if (type) where.type = type;
    if (status) where.status = status;
    if (minCondition || maxCondition) {
      where.currentCondition = {};
      if (minCondition) (where.currentCondition as Record<string, number>).gte = parseFloat(minCondition);
      if (maxCondition) (where.currentCondition as Record<string, number>).lte = parseFloat(maxCondition);
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { assetCode: { contains: search } },
        { location: { contains: search } },
      ];
    }

    // Try cache first
    const cacheKey = CacheKeys.assetList(user.tenantId, JSON.stringify(where) + `-${page}-${limit}`);
    const cached = await cache.get<{ assets: unknown[]; total: number }>(cacheKey);
    
    if (cached) {
      return NextResponse.json({ success: true, ...cached, page, limit });
    }

    const [assets, total] = await Promise.all([
      db.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          maintenanceRecords: {
            orderBy: { startDate: 'desc' },
            take: 1,
          },
          _count: {
            select: { simulations: true },
          },
        },
      }),
      db.asset.count({ where }),
    ]);

    const response = {
      assets: assets.map((a) => ({
        ...a,
        installationDate: a.installationDate.toISOString(),
        lastMaintenanceDate: a.lastMaintenanceDate?.toISOString(),
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        simulationCount: a._count.simulations,
      })),
      total,
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, response, 300);

    return NextResponse.json({
      success: true,
      ...response,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get assets error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create new asset
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, PERMISSIONS.CREATE_ASSET)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      assetCode,
      type,
      material,
      installationDate,
      expectedLifespan,
      trafficLoad,
      humidityIndex = 0.5,
      salinityIndex = 0.5,
      temperatureIndex = 0.5,
      maintenanceFreq = 12,
      lastMaintenanceDate,
      latitude,
      longitude,
      location,
      replacementCost,
      metadata,
    } = body;

    // Validate required fields
    if (!name || !assetCode || !type || !material || !installationDate || !latitude || !longitude) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check for duplicate asset code
    const existing = await db.asset.findUnique({ where: { assetCode } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Asset code already exists' },
        { status: 400 }
      );
    }

    const asset = await db.asset.create({
      data: {
        tenantId: user.tenantId,
        name,
        assetCode,
        type,
        material: material.toLowerCase(),
        installationDate: new Date(installationDate),
        expectedLifespan: expectedLifespan || 30,
        trafficLoad: trafficLoad || 50,
        humidityIndex,
        salinityIndex,
        temperatureIndex,
        maintenanceFreq,
        lastMaintenanceDate: lastMaintenanceDate ? new Date(lastMaintenanceDate) : null,
        latitude,
        longitude,
        location,
        replacementCost: replacementCost || 0,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // Create audit log
    await createAuditLog(user.id, 'CREATE', 'Asset', asset.id, null, asset);

    // Invalidate cache
    await cache.deletePattern(`assets:${user.tenantId}:*`);

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
    console.error('Create asset error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
