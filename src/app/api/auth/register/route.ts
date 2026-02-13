import { NextRequest, NextResponse } from 'next/server';
import { register, getAuthUser, ROLES } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, role, tenantId } = body;

    if (!email || !password || !name || !tenantId) {
      return NextResponse.json(
        { success: false, error: 'Email, password, name, and tenantId are required' },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Invalid tenant' },
        { status: 400 }
      );
    }

    const result = await register(email, password, name, role || ROLES.VIEWER, tenantId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
