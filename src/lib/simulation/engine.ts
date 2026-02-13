// Urban Infrastructure Degradation Simulation Engine
// Implements rule-based deterioration calculations

import { db } from '@/lib/db';

// Material base wear rates (annual degradation in percentage points)
export const MATERIAL_WEAR_RATES: Record<string, number> = {
  // Road materials
  asphalt: 2.5,
  concrete: 1.8,
  gravel: 4.0,
  brick: 2.0,
  
  // Bridge materials
  steel: 1.5,
  reinforced_concrete: 1.6,
  prestressed_concrete: 1.4,
  timber: 3.5,
  
  // Pipe materials
  pvc: 1.2,
  ductile_iron: 1.8,
  cast_iron: 2.2,
  hdpe: 1.0,
  concrete_pipe: 2.0,
  clay: 2.5,
  
  // Drainage materials
  corrugated_metal: 2.8,
  plastic: 1.5,
  
  // General
  composite: 1.3,
  other: 2.0,
};

// Traffic load amplification factors
export function calculateTrafficAmplification(trafficLoad: number): number {
  // trafficLoad: 0-100 scale
  // Returns multiplier 1.0 - 3.0
  // Low traffic (0-30): 1.0x - 1.3x
  // Medium traffic (30-70): 1.3x - 2.0x  
  // High traffic (70-100): 2.0x - 3.0x
  
  if (trafficLoad <= 30) {
    return 1.0 + (trafficLoad / 30) * 0.3;
  } else if (trafficLoad <= 70) {
    return 1.3 + ((trafficLoad - 30) / 40) * 0.7;
  } else {
    return 2.0 + ((trafficLoad - 70) / 30) * 1.0;
  }
}

// Environmental multiplier
export function calculateEnvironmentalMultiplier(
  humidityIndex: number,
  salinityIndex: number,
  temperatureIndex: number
): number {
  // Each index is 0-1 scale
  // Returns multiplier 0.8 - 2.5
  
  // Humidity accelerates corrosion and material degradation
  const humidityFactor = 0.9 + humidityIndex * 0.6;
  
  // Salinity (coastal areas) accelerates corrosion significantly
  const salinityFactor = 1.0 + salinityIndex * 0.8;
  
  // Temperature extremes cause thermal stress
  const temperatureFactor = 0.9 + temperatureIndex * 0.5;
  
  // Combined effect (compounding but not additive)
  const multiplier = humidityFactor * salinityFactor * temperatureFactor;
  
  // Cap at reasonable maximum
  return Math.min(multiplier, 2.5);
}

// Maintenance reduction factor
export function calculateMaintenanceFactor(
  maintenanceFreq: number,
  monthsSinceLastMaintenance: number
): number {
  // maintenanceFreq: months between recommended maintenance
  // monthsSinceLastMaintenance: months since last maintenance
  
  // Well-maintained assets degrade slower
  // Overdue maintenance accelerates degradation
  
  const maintenanceRatio = monthsSinceLastMaintenance / maintenanceFreq;
  
  if (maintenanceRatio <= 1.0) {
    // Maintenance up to date - reduction factor
    return 0.7 + (1 - maintenanceRatio) * 0.2; // 0.7 - 0.9
  } else if (maintenanceRatio <= 2.0) {
    // Slightly overdue - slight acceleration
    return 1.0 + (maintenanceRatio - 1) * 0.3; // 1.0 - 1.3
  } else {
    // Severely overdue - significant acceleration
    return 1.3 + Math.min((maintenanceRatio - 2) * 0.2, 0.7); // 1.3 - 2.0
  }
}

// Age factor - older assets degrade faster
export function calculateAgeFactor(ageInYears: number, expectedLifespan: number): number {
  const ageRatio = ageInYears / expectedLifespan;
  
  if (ageRatio < 0.5) {
    // Young asset - normal degradation
    return 1.0;
  } else if (ageRatio < 0.75) {
    // Middle-aged - slightly increased
    return 1.0 + (ageRatio - 0.5) * 0.8;
  } else if (ageRatio < 1.0) {
    // Approaching end of life - significantly increased
    return 1.2 + (ageRatio - 0.75) * 1.6;
  } else {
    // Past expected lifespan - critical
    return 1.6 + Math.min((ageRatio - 1) * 0.8, 0.4);
  }
}

// Main degradation calculation for one month
export interface DegradationInput {
  material: string;
  ageInYears: number;
  expectedLifespan: number;
  trafficLoad: number;
  humidityIndex: number;
  salinityIndex: number;
  temperatureIndex: number;
  maintenanceFreq: number;
  monthsSinceLastMaintenance: number;
  currentCondition: number;
}

export interface DegradationResult {
  monthlyDegradation: number;
  newCondition: number;
  factors: {
    baseRate: number;
    trafficAmp: number;
    environmentalMult: number;
    maintenanceFactor: number;
    ageFactor: number;
  };
}

export function calculateMonthlyDegradation(input: DegradationInput): DegradationResult {
  // Get base wear rate (annual) and convert to monthly
  const baseAnnualRate = MATERIAL_WEAR_RATES[input.material.toLowerCase()] || 2.0;
  const baseMonthlyRate = baseAnnualRate / 12;
  
  // Calculate amplification factors
  const trafficAmp = calculateTrafficAmplification(input.trafficLoad);
  const environmentalMult = calculateEnvironmentalMultiplier(
    input.humidityIndex,
    input.salinityIndex,
    input.temperatureIndex
  );
  const maintenanceFactor = calculateMaintenanceFactor(
    input.maintenanceFreq,
    input.monthsSinceLastMaintenance
  );
  const ageFactor = calculateAgeFactor(input.ageInYears, input.expectedLifespan);
  
  // Combined monthly degradation
  const monthlyDegradation = baseMonthlyRate * trafficAmp * environmentalMult * maintenanceFactor * ageFactor;
  
  // Calculate new condition (can't go below 0)
  const newCondition = Math.max(0, input.currentCondition - monthlyDegradation);
  
  return {
    monthlyDegradation,
    newCondition,
    factors: {
      baseRate: baseMonthlyRate,
      trafficAmp,
      environmentalMult,
      maintenanceFactor,
      ageFactor,
    },
  };
}

// Failure probability calculation
export function calculateFailureProbability(
  conditionScore: number,
  degradationRate: number,
  monthsSinceLastMaintenance: number
): number {
  // Base probability from condition
  let probability = 0;
  
  if (conditionScore >= 80) {
    probability = 0.001;
  } else if (conditionScore >= 60) {
    probability = 0.01 + (80 - conditionScore) * 0.002;
  } else if (conditionScore >= 40) {
    probability = 0.05 + (60 - conditionScore) * 0.005;
  } else if (conditionScore >= 20) {
    probability = 0.15 + (40 - conditionScore) * 0.015;
  } else {
    probability = 0.45 + (20 - conditionScore) * 0.025;
  }
  
  // Adjust for degradation rate (faster degradation = higher risk)
  if (degradationRate > 1) {
    probability *= 1 + (degradationRate - 1) * 0.5;
  }
  
  // Adjust for maintenance status
  if (monthsSinceLastMaintenance > 24) {
    probability *= 1.3;
  } else if (monthsSinceLastMaintenance > 36) {
    probability *= 1.6;
  }
  
  return Math.min(probability, 0.99);
}

// Risk level determination
export function determineRiskLevel(
  conditionScore: number,
  failureProbability: number
): 'low' | 'medium' | 'high' | 'critical' {
  if (conditionScore < 20 || failureProbability > 0.4) {
    return 'critical';
  } else if (conditionScore < 40 || failureProbability > 0.2) {
    return 'high';
  } else if (conditionScore < 60 || failureProbability > 0.1) {
    return 'medium';
  } else {
    return 'low';
  }
}

// Full simulation run
export interface SimulationConfig {
  assetId: string;
  yearsToSimulate: number;
  scenarioType: 'standard' | 'optimistic' | 'pessimistic' | 'custom';
  customParams?: {
    trafficMultiplier?: number;
    maintenanceImprovement?: number;
    environmentalSeverity?: number;
  };
}

export interface SimulationMonthResult {
  month: number;
  year: number;
  conditionScore: number;
  degradationScore: number;
  failureProbability: number;
  riskLevel: string;
  maintenanceCost: number;
}

export async function runSimulation(config: SimulationConfig): Promise<SimulationMonthResult[]> {
  const asset = await db.asset.findUnique({
    where: { id: config.assetId },
    include: { maintenanceRecords: { orderBy: { startDate: 'desc' }, take: 1 } },
  });
  
  if (!asset) {
    throw new Error('Asset not found');
  }
  
  const results: SimulationMonthResult[] = [];
  const totalMonths = config.yearsToSimulate * 12;
  
  // Calculate initial state
  const installationDate = new Date(asset.installationDate);
  const now = new Date();
  const initialAgeInYears = (now.getTime() - installationDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  
  // Get months since last maintenance
  const lastMaintenance = asset.maintenanceRecords[0]?.startDate;
  const monthsSinceLastMaintenance = lastMaintenance
    ? Math.floor((now.getTime() - new Date(lastMaintenance).getTime()) / (30 * 24 * 60 * 60 * 1000))
    : 24; // Default to 24 months if no maintenance recorded
  
  let currentCondition = asset.currentCondition;
  let cumulativeDegradation = asset.degradationScore;
  
  // Scenario adjustments
  let scenarioMultiplier = 1.0;
  switch (config.scenarioType) {
    case 'optimistic':
      scenarioMultiplier = 0.8;
      break;
    case 'pessimistic':
      scenarioMultiplier = 1.3;
      break;
    case 'custom':
      scenarioMultiplier = config.customParams?.environmentalSeverity || 1.0;
      break;
  }
  
  for (let month = 1; month <= totalMonths; month++) {
    const year = Math.ceil(month / 12);
    const ageInYears = initialAgeInYears + month / 12;
    
    // Calculate degradation for this month
    const degradationInput: DegradationInput = {
      material: asset.material,
      ageInYears,
      expectedLifespan: asset.expectedLifespan,
      trafficLoad: asset.trafficLoad * (config.customParams?.trafficMultiplier || 1),
      humidityIndex: asset.humidityIndex,
      salinityIndex: asset.salinityIndex,
      temperatureIndex: asset.temperatureIndex,
      maintenanceFreq: asset.maintenanceFreq,
      monthsSinceLastMaintenance: monthsSinceLastMaintenance + month,
      currentCondition,
    };
    
    const degradation = calculateMonthlyDegradation(degradationInput);
    const monthlyDegr = degradation.monthlyDegradation * scenarioMultiplier;
    
    currentCondition = Math.max(0, currentCondition - monthlyDegr);
    cumulativeDegradation += monthlyDegr;
    
    const failureProb = calculateFailureProbability(
      currentCondition,
      monthlyDegr * 12, // Annualized
      monthsSinceLastMaintenance + month
    );
    
    const riskLevel = determineRiskLevel(currentCondition, failureProb);
    
    // Estimate maintenance cost based on condition
    let maintenanceCost = 0;
    if (currentCondition < 40) {
      maintenanceCost = asset.replacementCost * 0.3; // Major repair
    } else if (currentCondition < 60) {
      maintenanceCost = asset.replacementCost * 0.1; // Moderate repair
    } else if (currentCondition < 80) {
      maintenanceCost = asset.replacementCost * 0.02; // Routine maintenance
    }
    
    results.push({
      month,
      year,
      conditionScore: Math.round(currentCondition * 100) / 100,
      degradationScore: Math.round(cumulativeDegradation * 100) / 100,
      failureProbability: Math.round(failureProb * 1000) / 1000,
      riskLevel,
      maintenanceCost: Math.round(maintenanceCost * 100) / 100,
    });
    
    // If asset has failed, stop simulation
    if (currentCondition <= 0) {
      break;
    }
  }
  
  return results;
}

// Calculate expected failure window
export function calculateFailureWindow(
  simulationResults: SimulationMonthResult[]
): { start: Date; end: Date } | null {
  const criticalPoints = simulationResults.filter(r => r.riskLevel === 'critical');
  
  if (criticalPoints.length === 0) {
    return null;
  }
  
  const firstCritical = criticalPoints[0];
  const lastResult = simulationResults[simulationResults.length - 1];
  
  const now = new Date();
  const startDate = new Date(now.getTime() + firstCritical.month * 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + lastResult.month * 30 * 24 * 60 * 60 * 1000);
  
  return { start: startDate, end: endDate };
}

// Cost impact projection
export function calculateCostImpact(
  asset: { replacementCost: number; currentCondition: number },
  simulationResults: SimulationMonthResult[]
): {
  estimatedRepairCost: number;
  estimatedReplacementCost: number;
  projectedAnnualMaintenance: number;
  totalProjectedCost: number;
} {
  const conditionThreshold = 40;
  const criticalMonths = simulationResults.filter(r => r.conditionScore < conditionThreshold);
  
  const estimatedRepairCost = criticalMonths.length > 0
    ? asset.replacementCost * 0.3
    : 0;
  
  const estimatedReplacementCost = simulationResults.some(r => r.conditionScore <= 0)
    ? asset.replacementCost
    : 0;
  
  const projectedAnnualMaintenance = simulationResults
    .filter(r => r.month <= 12)
    .reduce((sum, r) => sum + r.maintenanceCost, 0);
  
  const totalProjectedCost = estimatedRepairCost + estimatedReplacementCost + projectedAnnualMaintenance;
  
  return {
    estimatedRepairCost,
    estimatedReplacementCost,
    projectedAnnualMaintenance,
    totalProjectedCost,
  };
}
