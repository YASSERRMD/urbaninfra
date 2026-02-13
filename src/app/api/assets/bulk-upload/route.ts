import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, createAuditLog, PERMISSIONS, hasPermission } from '@/lib/auth';
import { cache } from '@/lib/cache';

// POST - Bulk upload assets via CSV data
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(user.role, PERMISSIONS.BULK_UPLOAD)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { assets } = body;

    if (!Array.isArray(assets) || assets.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No assets provided' },
        { status: 400 }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[],
      createdAssets: [] as string[],
    };

    // Process each asset
    for (let i = 0; i < assets.length; i++) {
      const assetData = assets[i];
      
      try {
        // Validate required fields
        const requiredFields = ['name', 'assetCode', 'type', 'material', 'installationDate', 'latitude', 'longitude'];
        const missingFields = requiredFields.filter((f) => !assetData[f]);
        
        if (missingFields.length > 0) {
          results.failed++;
          results.errors.push({
            row: i + 1,
            error: `Missing required fields: ${missingFields.join(', ')}`,
          });
          continue;
        }

        // Check for duplicate asset code
        const existing = await db.asset.findUnique({ where: { assetCode: assetData.assetCode } });
        if (existing) {
          results.failed++;
          results.errors.push({
            row: i + 1,
            error: `Asset code ${assetData.assetCode} already exists`,
          });
          continue;
        }

        // Create asset
        const asset = await db.asset.create({
          data: {
            tenantId: user.tenantId,
            name: assetData.name,
            assetCode: assetData.assetCode,
            type: assetData.type.toLowerCase(),
            material: assetData.material.toLowerCase(),
            installationDate: new Date(assetData.installationDate),
            expectedLifespan: parseInt(assetData.expectedLifespan) || 30,
            trafficLoad: parseFloat(assetData.trafficLoad) || 50,
            humidityIndex: parseFloat(assetData.humidityIndex) || 0.5,
            salinityIndex: parseFloat(assetData.salinityIndex) || 0.5,
            temperatureIndex: parseFloat(assetData.temperatureIndex) || 0.5,
            maintenanceFreq: parseInt(assetData.maintenanceFreq) || 12,
            lastMaintenanceDate: assetData.lastMaintenanceDate ? new Date(assetData.lastMaintenanceDate) : null,
            latitude: parseFloat(assetData.latitude),
            longitude: parseFloat(assetData.longitude),
            location: assetData.location || null,
            replacementCost: parseFloat(assetData.replacementCost) || 0,
          },
        });

        results.success++;
        results.createdAssets.push(asset.id);
      } catch (err) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Create audit log
    await createAuditLog(
      user.id,
      'BULK_UPLOAD',
      'Asset',
      undefined,
      undefined,
      { total: assets.length, success: results.success, failed: results.failed }
    );

    // Invalidate cache
    await cache.deletePattern(`assets:${user.tenantId}:*`);

    return NextResponse.json({
      success: true,
      message: `Bulk upload completed: ${results.success} created, ${results.failed} failed`,
      results,
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
