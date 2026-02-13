import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, ROLES } from '@/lib/auth';
import { MATERIAL_WEAR_RATES } from '@/lib/simulation/engine';

// POST - Seed database with demo data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const force = body?.force === true;
    
    // Check if already seeded
    const existingTenant = await db.tenant.findFirst();
    if (existingTenant && !force) {
      return NextResponse.json({
        success: false,
        error: 'Database already seeded. Refresh the page and login.',
      });
    }

    // If force is true, delete existing data
    if (existingTenant && force) {
      await db.simulationResult.deleteMany();
      await db.simulationRun.deleteMany();
      await db.maintenanceRecord.deleteMany();
      await db.riskAssessment.deleteMany();
      await db.asset.deleteMany();
      await db.materialProperty.deleteMany();
      await db.auditLog.deleteMany();
      await db.user.deleteMany();
      await db.tenant.deleteMany();
    }

    // Create tenant
    const tenant = await db.tenant.create({
      data: {
        name: 'Municipality Infrastructure Department',
        slug: 'infra-dept',
        plan: 'enterprise',
        settings: JSON.stringify({
          city: 'Sharjah',
          country: 'United Arab Emirates',
          timezone: 'Asia/Dubai',
        }),
      },
    });

    // Create admin user
    const hashedPassword = await hashPassword('admin123');
    await db.user.create({
      data: {
        email: 'admin@urbaninfra.com',
        name: 'System Administrator',
        password: hashedPassword,
        role: ROLES.ADMIN,
        tenantId: tenant.id,
      },
    });

    // Create engineer user
    const engineerPassword = await hashPassword('engineer123');
    const engineer = await db.user.create({
      data: {
        email: 'engineer@urbaninfra.com',
        name: 'Civil Engineer',
        password: engineerPassword,
        role: ROLES.ENGINEER,
        tenantId: tenant.id,
      },
    });

    // Create viewer user
    const viewerPassword = await hashPassword('viewer123');
    await db.user.create({
      data: {
        email: 'viewer@urbaninfra.com',
        name: 'City Planner',
        password: viewerPassword,
        role: ROLES.VIEWER,
        tenantId: tenant.id,
      },
    });

    // Create material properties
    const materialProperties = Object.entries(MATERIAL_WEAR_RATES).map(([material, baseWearRate]) => ({
      material,
      assetType: getAssetTypeForMaterial(material),
      baseWearRate,
      durabilityFactor: 1 - baseWearRate / 5,
      maintenanceFactor: 0.8,
      costFactor: getCostFactorForMaterial(material),
      description: getDescriptionForMaterial(material),
    }));

    await db.materialProperty.createMany({
      data: materialProperties,
    });

    // Create sample assets with fictional place names
    const sampleAssets = generateDemoAssets(tenant.id);
    await db.asset.createMany({ data: sampleAssets });

    // Get created assets
    const assets = await db.asset.findMany({
      where: { tenantId: tenant.id },
    });

    // Create maintenance records for some assets
    const maintenanceRecords = assets.slice(0, 10).flatMap((asset, index) => [
      {
        assetId: asset.id,
        type: 'routine',
        description: 'Regular maintenance inspection',
        cost: asset.replacementCost * 0.02,
        startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 175 * 24 * 60 * 60 * 1000),
        performedBy: engineer.name,
      },
      index % 3 === 0
        ? {
            assetId: asset.id,
            type: 'repair',
            description: 'Surface repair and resurfacing',
            cost: asset.replacementCost * 0.1,
            startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000),
            performedBy: engineer.name,
          }
        : null,
    ].filter(Boolean));

    await db.maintenanceRecord.createMany({
      data: maintenanceRecords.filter((r): r is NonNullable<typeof r> => r !== null),
    });

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully!',
      data: {
        tenant: { id: tenant.id, name: tenant.name },
        users: [
          { email: 'admin@urbaninfra.com', password: 'admin123', role: ROLES.ADMIN },
          { email: 'engineer@urbaninfra.com', password: 'engineer123', role: ROLES.ENGINEER },
          { email: 'viewer@urbaninfra.com', password: 'viewer123', role: ROLES.VIEWER },
        ],
        assetsCreated: assets.length,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getAssetTypeForMaterial(material: string): string {
  const roadMaterials = ['asphalt', 'concrete', 'gravel', 'brick'];
  const bridgeMaterials = ['steel', 'reinforced_concrete', 'prestressed_concrete', 'timber'];
  const pipeMaterials = ['pvc', 'ductile_iron', 'cast_iron', 'hdpe', 'concrete_pipe', 'clay'];
  const drainageMaterials = ['corrugated_metal', 'plastic'];

  if (roadMaterials.includes(material)) return 'road';
  if (bridgeMaterials.includes(material)) return 'bridge';
  if (pipeMaterials.includes(material)) return 'pipe';
  if (drainageMaterials.includes(material)) return 'drainage';
  return 'general';
}

function getCostFactorForMaterial(material: string): number {
  const factors: Record<string, number> = {
    steel: 2.5,
    prestressed_concrete: 2.0,
    reinforced_concrete: 1.8,
    ductile_iron: 1.5,
    concrete: 1.4,
    asphalt: 1.0,
    pvc: 0.6,
    hdpe: 0.5,
    timber: 0.8,
    brick: 1.2,
  };
  return factors[material] || 1.0;
}

function getDescriptionForMaterial(material: string): string {
  const descriptions: Record<string, string> = {
    asphalt: 'Common road surface material',
    concrete: 'Durable material for roads and structures',
    steel: 'High-strength material for structures',
    pvc: 'Lightweight pipe material',
    hdpe: 'High-density polyethylene pipe',
    ductile_iron: 'Strong pipe material',
  };
  return descriptions[material] || 'Infrastructure material';
}

// Generate demo assets with fictional place names around Sharjah coordinates
function generateDemoAssets(tenantId: string) {
  const baseDate = new Date();
  const assets = [];
  
  // Center coordinates (approximate Sharjah area)
  const centerLat = 25.3573;
  const centerLng = 55.4033;

  // Fictional place names for locations
  const places = [
    'Al Fazrah District', 'Al Murajab Area', 'Al Saja Industrial Zone', 
    'Al Hidayah Sector', 'Al Noor District', 'Al Yarmouk Area',
    'Al Qadisiyyah Sector', 'Al Andalus District', 'Al Zahra Area',
    'Al Safina Zone', 'Al Bahar Sector', 'Al Waha District',
  ];

  // Fictional road asset names
  const roads = [
    { name: 'Route Alpha-1', code: 'R-A1' },
    { name: 'Route Beta-2', code: 'R-B2' },
    { name: 'Route Gamma-3', code: 'R-G3' },
    { name: 'Route Delta-4', code: 'R-D4' },
    { name: 'Route Epsilon-5', code: 'R-E5' },
    { name: 'Route Zeta-6', code: 'R-Z6' },
    { name: 'Route Eta-7', code: 'R-H7' },
    { name: 'Route Theta-8', code: 'R-T8' },
    { name: 'Route Iota-9', code: 'R-I9' },
    { name: 'Route Kappa-10', code: 'R-K10' },
    { name: 'Route Lambda-11', code: 'R-L11' },
    { name: 'Route Mu-12', code: 'R-M12' },
    { name: 'Route Nu-13', code: 'R-N13' },
    { name: 'Route Xi-14', code: 'R-X14' },
    { name: 'Route Omicron-15', code: 'R-O15' },
  ];

  // Fictional bridge asset names
  const bridges = [
    { name: 'Structure BR-01', code: 'BR-01' },
    { name: 'Structure BR-02', code: 'BR-02' },
    { name: 'Structure BR-03', code: 'BR-03' },
    { name: 'Structure BR-04', code: 'BR-04' },
    { name: 'Structure BR-05', code: 'BR-05' },
  ];

  // Fictional pipeline asset names
  const pipelines = [
    { name: 'Pipeline PL-01', code: 'PL-01' },
    { name: 'Pipeline PL-02', code: 'PL-02' },
    { name: 'Pipeline PL-03', code: 'PL-03' },
    { name: 'Pipeline PL-04', code: 'PL-04' },
    { name: 'Pipeline PL-05', code: 'PL-05' },
    { name: 'Pipeline PL-06', code: 'PL-06' },
    { name: 'Pipeline PL-07', code: 'PL-07' },
    { name: 'Pipeline PL-08', code: 'PL-08' },
    { name: 'Pipeline PL-09', code: 'PL-09' },
    { name: 'Pipeline PL-10', code: 'PL-10' },
  ];

  // Fictional drainage asset names
  const drainage = [
    { name: 'Drainage DN-01', code: 'DN-01' },
    { name: 'Drainage DN-02', code: 'DN-02' },
    { name: 'Drainage DN-03', code: 'DN-03' },
    { name: 'Drainage DN-04', code: 'DN-04' },
    { name: 'Drainage DN-05', code: 'DN-05' },
  ];

  // Create Roads
  roads.forEach((road, i) => {
    const latOffset = (Math.random() - 0.5) * 0.08;
    const lngOffset = (Math.random() - 0.5) * 0.08;
    assets.push({
      tenantId,
      name: road.name,
      assetCode: `${road.code}-${2024}`,
      type: 'road',
      material: i % 3 === 0 ? 'concrete' : 'asphalt',
      installationDate: new Date(baseDate.getFullYear() - 8 - Math.floor(Math.random() * 12)),
      expectedLifespan: 25,
      trafficLoad: 40 + Math.random() * 50,
      humidityIndex: 0.6 + Math.random() * 0.3,
      salinityIndex: 0.7 + Math.random() * 0.25,
      temperatureIndex: 0.7 + Math.random() * 0.25,
      maintenanceFreq: 12,
      latitude: centerLat + latOffset,
      longitude: centerLng + lngOffset,
      location: places[i % places.length],
      currentCondition: 45 + Math.random() * 50,
      degradationScore: Math.random() * 35,
      status: 'operational',
      replacementCost: 800000 + Math.random() * 2000000,
    });
  });

  // Create Bridges
  bridges.forEach((bridge, i) => {
    const latOffset = (Math.random() - 0.5) * 0.06;
    const lngOffset = (Math.random() - 0.5) * 0.06;
    assets.push({
      tenantId,
      name: bridge.name,
      assetCode: `${bridge.code}-${2024}`,
      type: 'bridge',
      material: i % 2 === 0 ? 'steel' : 'reinforced_concrete',
      installationDate: new Date(baseDate.getFullYear() - 15 - Math.floor(Math.random() * 20)),
      expectedLifespan: 50,
      trafficLoad: 50 + Math.random() * 45,
      humidityIndex: 0.65 + Math.random() * 0.25,
      salinityIndex: 0.75 + Math.random() * 0.2,
      temperatureIndex: 0.7 + Math.random() * 0.2,
      maintenanceFreq: 24,
      latitude: centerLat + latOffset,
      longitude: centerLng + lngOffset,
      location: places[i % places.length],
      currentCondition: 55 + Math.random() * 40,
      degradationScore: Math.random() * 30,
      status: 'operational',
      replacementCost: 15000000 + Math.random() * 35000000,
    });
  });

  // Create Pipelines
  pipelines.forEach((pipe, i) => {
    const latOffset = (Math.random() - 0.5) * 0.07;
    const lngOffset = (Math.random() - 0.5) * 0.07;
    assets.push({
      tenantId,
      name: pipe.name,
      assetCode: `${pipe.code}-${2024}`,
      type: 'pipe',
      material: ['pvc', 'ductile_iron', 'hdpe', 'concrete_pipe'][i % 4],
      installationDate: new Date(baseDate.getFullYear() - 12 - Math.floor(Math.random() * 18)),
      expectedLifespan: 40,
      trafficLoad: 10 + Math.random() * 20,
      humidityIndex: 0.7 + Math.random() * 0.25,
      salinityIndex: 0.8 + Math.random() * 0.15,
      temperatureIndex: 0.6 + Math.random() * 0.3,
      maintenanceFreq: 36,
      latitude: centerLat + latOffset,
      longitude: centerLng + lngOffset,
      location: places[i % places.length],
      currentCondition: 50 + Math.random() * 45,
      degradationScore: Math.random() * 35,
      status: 'operational',
      replacementCost: 500000 + Math.random() * 1500000,
    });
  });

  // Create Drainage
  drainage.forEach((drain, i) => {
    const latOffset = (Math.random() - 0.5) * 0.05;
    const lngOffset = (Math.random() - 0.5) * 0.05;
    assets.push({
      tenantId,
      name: drain.name,
      assetCode: `${drain.code}-${2024}`,
      type: 'drainage',
      material: i % 2 === 0 ? 'corrugated_metal' : 'plastic',
      installationDate: new Date(baseDate.getFullYear() - 10 - Math.floor(Math.random() * 12)),
      expectedLifespan: 30,
      trafficLoad: 5 + Math.random() * 15,
      humidityIndex: 0.75 + Math.random() * 0.2,
      salinityIndex: 0.85 + Math.random() * 0.1,
      temperatureIndex: 0.65 + Math.random() * 0.25,
      maintenanceFreq: 18,
      latitude: centerLat + latOffset,
      longitude: centerLng + lngOffset,
      location: places[i % places.length],
      currentCondition: 55 + Math.random() * 40,
      degradationScore: Math.random() * 30,
      status: 'operational',
      replacementCost: 300000 + Math.random() * 800000,
    });
  });

  return assets;
}
