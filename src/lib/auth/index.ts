import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'urban-infrastructure-simulator-secret-key';
const SALT_ROUNDS = 10;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT Token generation
export function generateToken(user: AuthUser): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// Role-based access control
export const ROLES = {
  ADMIN: 'admin',
  ENGINEER: 'engineer',
  VIEWER: 'viewer',
} as const;

export const PERMISSIONS = {
  CREATE_ASSET: [ROLES.ADMIN, ROLES.ENGINEER],
  UPDATE_ASSET: [ROLES.ADMIN, ROLES.ENGINEER],
  DELETE_ASSET: [ROLES.ADMIN],
  BULK_UPLOAD: [ROLES.ADMIN, ROLES.ENGINEER],
  RUN_SIMULATION: [ROLES.ADMIN, ROLES.ENGINEER],
  VIEW_REPORTS: [ROLES.ADMIN, ROLES.ENGINEER, ROLES.VIEWER],
  GENERATE_REPORTS: [ROLES.ADMIN, ROLES.ENGINEER],
  MANAGE_USERS: [ROLES.ADMIN],
  VIEW_ALL_TENANTS: [ROLES.ADMIN],
} as const;

export function hasPermission(role: string, permission: readonly string[]): boolean {
  return permission.includes(role);
}

// Auth helper for API routes
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  
  if (!payload) {
    return null;
  }
  
  // Verify user still exists and is active
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      isActive: true,
    },
  });
  
  if (!user || !user.isActive) {
    return null;
  }
  
  return user;
}

// Create audit log entry
export async function createAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId?: string,
  oldValue?: unknown,
  newValue?: unknown,
  metadata?: unknown
) {
  return db.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

// Authentication response type
export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}

// Login function
export async function login(email: string, password: string): Promise<AuthResponse> {
  const user = await db.user.findUnique({
    where: { email },
    include: { tenant: true },
  });
  
  if (!user || !user.isActive) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
    return { success: false, error: 'Invalid credentials' };
  }
  
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
  };
  
  const token = generateToken(authUser);
  
  return { success: true, user: authUser, token };
}

// Register function (admin only in production)
export async function register(
  email: string,
  password: string,
  name: string,
  role: string,
  tenantId: string
): Promise<AuthResponse> {
  const existing = await db.user.findUnique({ where: { email } });
  
  if (existing) {
    return { success: false, error: 'Email already registered' };
  }
  
  const hashedPassword = await hashPassword(password);
  
  const user = await db.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role,
      tenantId,
    },
  });
  
  const authUser: AuthUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
  };
  
  const token = generateToken(authUser);
  
  return { success: true, user: authUser, token };
}
