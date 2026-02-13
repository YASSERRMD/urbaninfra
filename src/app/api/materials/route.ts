import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { cache, CacheKeys } from '@/lib/cache';
import { MATERIAL_WEAR_RATES } from '@/lib/simulation/engine';

// GET - Get all material properties
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Try cache
    const cacheKey = CacheKeys.materialProperties();
    const cached = await cache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, materials: cached });
    }

    // Get from database
    const dbMaterials = await db.materialProperty.findMany();

    // Combine with built-in rates
    const materials = Object.entries(MATERIAL_WEAR_RATES).map(([material, baseWearRate]) => {
      const dbInfo = dbMaterials.find((m) => m.material.toLowerCase() === material.toLowerCase());
      return {
        material,
        baseWearRate,
        durabilityFactor: dbInfo?.durabilityFactor || 1 - baseWearRate / 5,
        maintenanceFactor: dbInfo?.maintenanceFactor || 0.8,
        costFactor: dbInfo?.costFactor || 1,
        assetType: dbInfo?.assetType || 'general',
        description: dbInfo?.description || null,
      };
    });

    // Cache for 1 hour
    await cache.set(cacheKey, materials, 3600);

    return NextResponse.json({ success: true, materials });
  } catch (error) {
    console.error('Get materials error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
