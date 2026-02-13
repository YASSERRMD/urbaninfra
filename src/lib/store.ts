import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
}

export interface Asset {
  id: string;
  name: string;
  assetCode: string;
  type: string;
  material: string;
  installationDate: string;
  expectedLifespan: number;
  trafficLoad: number;
  humidityIndex: number;
  salinityIndex: number;
  temperatureIndex: number;
  maintenanceFreq: number;
  lastMaintenanceDate: string | null;
  latitude: number;
  longitude: number;
  location: string | null;
  currentCondition: number;
  degradationScore: number;
  status: string;
  replacementCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationResult {
  month: number;
  year: number;
  conditionScore: number;
  degradationScore: number;
  failureProbability: number;
  riskLevel: string;
  maintenanceCost: number;
}

export interface Simulation {
  id: string;
  assetId: string;
  userId: string;
  name: string;
  description: string | null;
  scenarioType: string;
  yearsToSimulate: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  results?: SimulationResult[];
}

export interface KPIs {
  totalAssets: number;
  avgCondition: number;
  avgDegradation: number;
  totalReplacementCost: number;
  maintenanceBacklog: number;
  estimatedMaintenanceBudget: number;
  recentSimulations: number;
  riskDistribution: {
    critical: number;
    atRisk: number;
    operational: number;
  };
  assetsByType: { type: string; count: number }[];
  assetsByStatus: { status: string; count: number }[];
  failureForecast: {
    year1: number;
    year2: number;
    year3: number;
    year4: number;
    year5: number;
  };
}

interface AppState {
  // Auth
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  
  // UI State
  activeTab: string;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  
  // Data
  assets: Asset[];
  selectedAsset: Asset | null;
  simulations: Simulation[];
  selectedSimulation: Simulation | null;
  kpis: KPIs | null;
  
  // Loading states
  isLoading: boolean;
  isSimulating: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setActiveTab: (tab: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setAssets: (assets: Asset[]) => void;
  setSelectedAsset: (asset: Asset | null) => void;
  setSimulations: (simulations: Simulation[]) => void;
  setSelectedSimulation: (simulation: Simulation | null) => void;
  setKpis: (kpis: KPIs) => void;
  setIsLoading: (loading: boolean) => void;
  setIsSimulating: (simulating: boolean) => void;
  
  // API Actions
  fetchAssets: (filters?: Record<string, string>) => Promise<void>;
  fetchAsset: (id: string) => Promise<void>;
  createAsset: (data: Partial<Asset>) => Promise<boolean>;
  updateAsset: (id: string, data: Partial<Asset>) => Promise<boolean>;
  deleteAsset: (id: string) => Promise<boolean>;
  runSimulation: (assetId: string, config: Record<string, unknown>) => Promise<boolean>;
  fetchKpis: () => Promise<void>;
}

const API_BASE = '/api';

async function apiCall(endpoint: string, options: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  return response.json();
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      activeTab: 'dashboard',
      sidebarOpen: true,
      theme: 'light',
      assets: [],
      selectedAsset: null,
      simulations: [],
      selectedSimulation: null,
      kpis: null,
      isLoading: false,
      isSimulating: false,
      
      // Auth actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),
      
      login: async (email, password) => {
        try {
          const result = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          
          if (result.success) {
            set({
              user: result.user,
              token: result.token,
              isAuthenticated: true,
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Login error:', error);
          return false;
        }
      },
      
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          assets: [],
          selectedAsset: null,
          simulations: [],
          selectedSimulation: null,
          kpis: null,
        });
      },
      
      // UI actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
      
      // Data setters
      setAssets: (assets) => set({ assets }),
      setSelectedAsset: (asset) => set({ selectedAsset: asset }),
      setSimulations: (simulations) => set({ simulations }),
      setSelectedSimulation: (simulation) => set({ selectedSimulation: simulation }),
      setKpis: (kpis) => set({ kpis }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setIsSimulating: (simulating) => set({ isSimulating: simulating }),
      
      // API Actions
      fetchAssets: async (filters = {}) => {
        set({ isLoading: true });
        try {
          const params = new URLSearchParams(filters).toString();
          const result = await apiCall(`/assets?${params}`, {}, get().token);
          if (result.success) {
            set({ assets: result.assets });
          }
        } catch (error) {
          console.error('Fetch assets error:', error);
        } finally {
          set({ isLoading: false });
        }
      },
      
      fetchAsset: async (id) => {
        set({ isLoading: true });
        try {
          const result = await apiCall(`/assets/${id}`, {}, get().token);
          if (result.success) {
            set({ selectedAsset: result.asset });
          }
        } catch (error) {
          console.error('Fetch asset error:', error);
        } finally {
          set({ isLoading: false });
        }
      },
      
      createAsset: async (data) => {
        try {
          const result = await apiCall('/assets', {
            method: 'POST',
            body: JSON.stringify(data),
          }, get().token);
          
          if (result.success) {
            get().fetchAssets();
            return true;
          }
          return false;
        } catch (error) {
          console.error('Create asset error:', error);
          return false;
        }
      },
      
      updateAsset: async (id, data) => {
        try {
          const result = await apiCall(`/assets/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
          }, get().token);
          
          if (result.success) {
            get().fetchAssets();
            return true;
          }
          return false;
        } catch (error) {
          console.error('Update asset error:', error);
          return false;
        }
      },
      
      deleteAsset: async (id) => {
        try {
          const result = await apiCall(`/assets/${id}`, {
            method: 'DELETE',
          }, get().token);
          
          if (result.success) {
            get().fetchAssets();
            return true;
          }
          return false;
        } catch (error) {
          console.error('Delete asset error:', error);
          return false;
        }
      },
      
      runSimulation: async (assetId, config) => {
        set({ isSimulating: true });
        try {
          const result = await apiCall('/simulations/run', {
            method: 'POST',
            body: JSON.stringify({ assetId, ...config }),
          }, get().token);
          
          if (result.success) {
            set({ selectedSimulation: result.simulation });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Simulation error:', error);
          return false;
        } finally {
          set({ isSimulating: false });
        }
      },
      
      fetchKpis: async () => {
        try {
          const result = await apiCall('/kpis', {}, get().token);
          if (result.success) {
            set({ kpis: result.kpis });
          }
        } catch (error) {
          console.error('Fetch KPIs error:', error);
        }
      },
    }),
    {
      name: 'urban-infrastructure-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
      }),
    }
  )
);
