import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

// GET - List all simulations
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (assetId) where.assetId = assetId;
    if (status) where.status = status;

    const [simulations, total] = await Promise.all([
      db.simulationRun.findMany({
        where: {
          ...where,
          user: { tenantId: user.tenantId },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              assetCode: true,
              type: true,
            },
          },
          user: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { results: true },
          },
        },
      }),
      db.simulationRun.count({
        where: {
          ...where,
          user: { tenantId: user.tenantId },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      simulations: simulations.map((s) => ({
        ...s,
        startedAt: s.startedAt?.toISOString(),
        completedAt: s.completedAt?.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        resultCount: s._count.results,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get simulations error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
