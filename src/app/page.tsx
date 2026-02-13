'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useAppStore, Asset } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MapPin, Droplets, Wind, Thermometer, AlertCircle, Play, RefreshCw,
  Building2, Sun, Moon, LogOut, Search, Activity, AlertTriangle, DollarSign,
  BarChart3, Map
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, PieChart as RechartsPieChart, Pie, Cell, Legend } from 'recharts';

// Dynamic import for Leaflet (SSR disabled)
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
);
const Circle = dynamic(
  () => import('react-leaflet').then((mod) => mod.Circle),
  { ssr: false }
);

// Color palette
const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6366F1', '#8B5CF6', '#EC4899'];

// Login Component
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const login = useAppStore((s) => s.login);
  const fetchKpis = useAppStore((s) => s.fetchKpis);
  const fetchAssets = useAppStore((s) => s.fetchAssets);
  const { theme, setTheme } = useTheme();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    const success = await login(email, password);
    if (success) {
      await Promise.all([fetchKpis(), fetchAssets()]);
    } else {
      setError('Invalid credentials. Try admin@urbaninfra.com / admin123');
    }
    setIsLoading(false);
  };

  const handleSeed = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/seed', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        setError('✅ Database seeded! Now login with: admin@urbaninfra.com / admin123');
      } else {
        setError(result.error || 'Already seeded. Try logging in.');
      }
    } catch (err) {
      setError('Failed to seed database');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/20 rounded-full">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Urban Infrastructure</CardTitle>
          <CardDescription>
            Failure Simulator - Sharjah City
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@urbaninfra.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <Alert>
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full"
              onClick={handleSeed}
              disabled={isLoading}
            >
              {isLoading ? 'Seeding...' : '🌱 Seed Demo Data'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// KPI Card
function KPICard({ title, value, subtitle, icon: Icon }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="p-3 rounded-full bg-primary/10 text-primary">
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Asset Detail Modal
function AssetDetailModal({ asset, open, onOpenChange, onRunSimulation }: {
  asset: Asset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunSimulation: () => void;
}) {
  const [simulationConfig, setSimulationConfig] = useState({
    yearsToSimulate: 5,
    scenarioType: 'standard',
    name: '',
  });
  const [isSimulating, setIsSimulating] = useState(false);

  if (!asset) return null;

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return 'text-green-500';
    if (condition >= 60) return 'text-amber-500';
    if (condition >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      operational: 'bg-green-500/20 text-green-600 dark:text-green-400',
      at_risk: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
      critical: 'bg-red-500/20 text-red-600 dark:text-red-400',
      failed: 'bg-red-900/20 text-red-400',
      under_maintenance: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  const handleSimulation = async () => {
    setIsSimulating(true);
    try {
      const token = localStorage.getItem('urban-infrastructure-storage');
      const parsed = token ? JSON.parse(token) : null;
      
      const response = await fetch('/api/simulations/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${parsed?.state?.token}`,
        },
        body: JSON.stringify({
          assetId: asset.id,
          ...simulationConfig,
        }),
      });
      
      const result = await response.json();
      if (result.success) {
        onRunSimulation();
      }
    } catch (error) {
      console.error('Simulation error:', error);
    }
    setIsSimulating(false);
  };

  const installedYear = new Date(asset.installationDate).getFullYear();
  const age = new Date().getFullYear() - installedYear;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            {asset.name}
          </DialogTitle>
          <DialogDescription>
            {asset.assetCode} • {asset.location}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Condition Score</p>
                <p className={cn('text-2xl font-bold', getConditionColor(asset.currentCondition))}>
                  {asset.currentCondition.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge className={getStatusColor(asset.status)}>
                  {asset.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Age</p>
                <p className="text-2xl font-bold">{age} years</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Replacement Cost</p>
                <p className="text-lg font-bold">AED {(asset.replacementCost / 1000000).toFixed(2)}M</p>
              </CardContent>
            </Card>
          </div>

          {/* Details Tabs */}
          <Tabs defaultValue="details">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="environmental">Environmental</TabsTrigger>
              <TabsTrigger value="simulate">Simulate</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">{asset.type}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Material</span>
                    <span className="font-medium capitalize">{asset.material.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Expected Lifespan</span>
                    <span className="font-medium">{asset.expectedLifespan} years</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Installation Date</span>
                    <span className="font-medium">{new Date(asset.installationDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Traffic Load</span>
                    <span className="font-medium">{asset.trafficLoad.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Maintenance Freq</span>
                    <span className="font-medium">{asset.maintenanceFreq} months</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Degradation Score</span>
                    <span className="font-medium">{asset.degradationScore.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Coordinates</span>
                    <span className="font-medium text-sm">{asset.latitude.toFixed(4)}, {asset.longitude.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="environmental" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Droplets className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                    <p className="text-xs text-muted-foreground">Humidity Index</p>
                    <p className="text-xl font-bold">{(asset.humidityIndex * 100).toFixed(0)}%</p>
                    <Progress value={asset.humidityIndex * 100} className="mt-2 h-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Wind className="w-8 h-8 mx-auto mb-2 text-cyan-500" />
                    <p className="text-xs text-muted-foreground">Salinity Index</p>
                    <p className="text-xl font-bold">{(asset.salinityIndex * 100).toFixed(0)}%</p>
                    <Progress value={asset.salinityIndex * 100} className="mt-2 h-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Thermometer className="w-8 h-8 mx-auto mb-2 text-red-500" />
                    <p className="text-xs text-muted-foreground">Temperature Index</p>
                    <p className="text-xl font-bold">{(asset.temperatureIndex * 100).toFixed(0)}%</p>
                    <Progress value={asset.temperatureIndex * 100} className="mt-2 h-2" />
                  </CardContent>
                </Card>
              </div>
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Sharjah&apos;s coastal environment results in higher salinity levels, accelerating corrosion in metal infrastructure.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="simulate" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Years to Simulate: {simulationConfig.yearsToSimulate}</Label>
                    <Slider
                      value={[simulationConfig.yearsToSimulate]}
                      onValueChange={([v]) => setSimulationConfig(prev => ({ ...prev, yearsToSimulate: v }))}
                      min={1}
                      max={20}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scenario Type</Label>
                    <Select
                      value={simulationConfig.scenarioType}
                      onValueChange={(v) => setSimulationConfig(prev => ({ ...prev, scenarioType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="optimistic">Optimistic (Better Maintenance)</SelectItem>
                        <SelectItem value="pessimistic">Pessimistic (Harsh Conditions)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSimulation}
                    disabled={isSimulating}
                  >
                    {isSimulating ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Running Simulation...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Degradation Simulation
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Simulation Parameters</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Material: <span className="text-foreground capitalize">{asset.material}</span></li>
                    <li>• Current Age: <span className="text-foreground">{age} years</span></li>
                    <li>• Traffic Load: <span className="text-foreground">{asset.trafficLoad.toFixed(0)}%</span></li>
                    <li>• Environmental Factor: <span className="text-foreground">{((asset.humidityIndex + asset.salinityIndex + asset.temperatureIndex) / 3 * 100).toFixed(0)}%</span></li>
                  </ul>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Map Component with Leaflet
function MapView({ assets, selectedAsset, onSelectAsset }: { 
  assets: Asset[]; 
  selectedAsset: Asset | null;
  onSelectAsset: (asset: Asset) => void;
}) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [L, setL] = useState<typeof import('leaflet') | null>(null);

  useEffect(() => {
    setMounted(true);
    import('leaflet').then((leaflet) => {
      setL(leaflet.default);
    });
  }, []);

  if (!mounted || !L) {
    return <div className="h-[500px] bg-muted rounded-lg animate-pulse flex items-center justify-center">Loading map...</div>;
  }

  // Sharjah center
  const sharjahCenter: [number, number] = [25.3573, 55.4033];

  const getMarkerColor = (condition: number) => {
    if (condition >= 80) return '#10B981';
    if (condition >= 60) return '#F59E0B';
    if (condition >= 40) return '#EF4444';
    return '#7F1D1D';
  };

  const tileUrl = theme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const createIcon = (color: string) => L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  return (
    <MapContainer
      center={sharjahCenter}
      zoom={12}
      style={{ height: '500px', width: '100%', borderRadius: '8px' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url={tileUrl}
      />
      {assets.map((asset) => {
        const color = getMarkerColor(asset.currentCondition);
        
        return (
          <Marker
            key={asset.id}
            position={[asset.latitude, asset.longitude]}
            icon={createIcon(color)}
          >
            <Popup>
              <div className="p-2 min-w-[200px]">
                <h3 className="font-semibold text-sm">{asset.name}</h3>
                <p className="text-xs text-muted-foreground">{asset.assetCode}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Type:</span>
                    <span className="font-medium capitalize">{asset.type}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Condition:</span>
                    <span className="font-medium">{asset.currentCondition.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Status:</span>
                    <Badge variant="outline" className="text-xs capitalize">{asset.status}</Badge>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  className="w-full mt-2" 
                  onClick={() => onSelectAsset(asset)}
                >
                  View Details
                </Button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

// Dashboard
function Dashboard() {
  const kpis = useAppStore((s) => s.kpis);

  if (!kpis) return <div className="flex items-center justify-center h-64">Loading KPIs...</div>;

  const typeChartData = kpis.assetsByType.map((t, i) => ({
    name: t.type.charAt(0).toUpperCase() + t.type.slice(1),
    value: t.count,
    fill: COLORS[i % COLORS.length],
  }));

  const forecastData = [
    { year: 'Y1', failures: kpis.failureForecast.year1 },
    { year: 'Y2', failures: kpis.failureForecast.year2 },
    { year: 'Y3', failures: kpis.failureForecast.year3 },
    { year: 'Y4', failures: kpis.failureForecast.year4 },
    { year: 'Y5', failures: kpis.failureForecast.year5 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Assets" value={kpis.totalAssets} subtitle="Infrastructure items" icon={Building2} />
        <KPICard title="Average Condition" value={`${kpis.avgCondition.toFixed(1)}%`} subtitle="Overall health" icon={Activity} />
        <KPICard title="Maintenance Backlog" value={kpis.maintenanceBacklog} subtitle="Need attention" icon={AlertTriangle} />
        <KPICard title="Est. Budget" value={`AED ${(kpis.estimatedMaintenanceBudget / 1000000).toFixed(1)}M`} subtitle="Annual projection" icon={DollarSign} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Operational</span>
                </div>
                <span className="font-bold">{kpis.riskDistribution.operational}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>At Risk</span>
                </div>
                <span className="font-bold">{kpis.riskDistribution.atRisk}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Critical</span>
                </div>
                <span className="font-bold">{kpis.riskDistribution.critical}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">5-Year Failure Forecast</CardTitle>
          </CardHeader>
          <CardContent className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Area type="monotone" dataKey="failures" stroke="#EF4444" fill="#EF4444" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assets by Type</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie data={typeChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" label>
                {typeChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </RechartsPieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// Asset List
function AssetList({ onSelectAsset }: { onSelectAsset: (asset: Asset) => void }) {
  const assets = useAppStore((s) => s.assets);
  const fetchAssets = useAppStore((s) => s.fetchAssets);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.assetCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || asset.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || asset.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getConditionColor = (condition: number) => {
    if (condition >= 80) return 'text-green-500';
    if (condition >= 60) return 'text-amber-500';
    if (condition >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      operational: 'bg-green-500/20 text-green-600',
      at_risk: 'bg-amber-500/20 text-amber-600',
      critical: 'bg-red-500/20 text-red-600',
      failed: 'bg-red-900/20 text-red-400',
      under_maintenance: 'bg-blue-500/20 text-blue-600',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="road">Road</SelectItem>
            <SelectItem value="bridge">Bridge</SelectItem>
            <SelectItem value="pipe">Pipe</SelectItem>
            <SelectItem value="drainage">Drainage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="operational">Operational</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <ScrollArea className="h-[500px]">
          <div className="grid gap-2 p-4">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 cursor-pointer"
                onClick={() => onSelectAsset(asset)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{asset.name}</p>
                    <Badge variant="outline" className="capitalize">{asset.type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{asset.assetCode} • {asset.location}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={cn('font-bold', getConditionColor(asset.currentCondition))}>
                      {asset.currentCondition.toFixed(0)}%
                    </p>
                    <Progress value={asset.currentCondition} className="w-16 h-1.5" />
                  </div>
                  <Badge className={cn('capitalize', getStatusColor(asset.status))}>
                    {asset.status.replace('_', ' ')}
                  </Badge>
                  <Button size="sm" variant="ghost">
                    <MapPin className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

// Simulation Results Panel
function SimulationResults() {
  const [simulations, setSimulations] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const user = useAppStore((s) => s.user);

  useEffect(() => {
    const fetchSimulations = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const token = localStorage.getItem('urban-infrastructure-storage');
        const parsed = token ? JSON.parse(token) : null;
        
        const response = await fetch('/api/simulations', {
          headers: {
            'Authorization': `Bearer ${parsed?.state?.token}`,
          },
        });
        const result = await response.json();
        if (result.success) {
          setSimulations(result.simulations);
        }
      } catch (error) {
        console.error('Failed to fetch simulations:', error);
      }
      setIsLoading(false);
    };
    
    fetchSimulations();
  }, [user]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Simulation History</CardTitle>
          <CardDescription>View past simulation runs and their results</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : simulations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No simulations yet. Run a simulation from an asset&apos;s detail page.
            </div>
          ) : (
            <div className="space-y-2">
              {simulations.map((sim: Record<string, unknown>) => (
                <div key={sim.id as string} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{sim.name as string}</p>
                      <p className="text-sm text-muted-foreground">
                        {(sim.asset as Record<string, unknown>)?.name as string} • {sim.scenarioType as string} scenario
                      </p>
                    </div>
                    <Badge variant={sim.status === 'completed' ? 'default' : 'secondary'}>
                      {sim.status as string}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(sim.createdAt as string).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main App
export default function Page() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const assets = useAppStore((s) => s.assets);
  const fetchKpis = useAppStore((s) => s.fetchKpis);
  const fetchAssets = useAppStore((s) => s.fetchAssets);
  const { theme, setTheme } = useTheme();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchKpis();
      fetchAssets();
    }
  }, [isAuthenticated, fetchKpis, fetchAssets]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchKpis, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchKpis]);

  const handleSelectAsset = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    setDetailOpen(true);
  }, []);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-bold">Urban Infrastructure Failure Simulator</h1>
              <p className="text-xs text-muted-foreground">Sharjah City, UAE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard"><BarChart3 className="w-4 h-4 mr-2" />Dashboard</TabsTrigger>
            <TabsTrigger value="assets"><Building2 className="w-4 h-4 mr-2" />Assets</TabsTrigger>
            <TabsTrigger value="map"><Map className="w-4 h-4 mr-2" />Map</TabsTrigger>
            <TabsTrigger value="simulations"><Play className="w-4 h-4 mr-2" />Simulations</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard />
          </TabsContent>

          <TabsContent value="assets">
            <AssetList onSelectAsset={handleSelectAsset} />
          </TabsContent>

          <TabsContent value="map">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Sharjah Infrastructure Map
                </CardTitle>
                <CardDescription>
                  Click on markers to view asset details. Colors indicate condition score.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MapView 
                  assets={assets} 
                  selectedAsset={selectedAsset}
                  onSelectAsset={handleSelectAsset}
                />
                <div className="flex items-center gap-6 mt-4 justify-center flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-500" />
                    <span className="text-sm">≥80% Good</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-amber-500" />
                    <span className="text-sm">60-79% Fair</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-red-500" />
                    <span className="text-sm">40-59% Poor</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-red-900" />
                    <span className="text-sm">&lt;40% Critical</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="simulations">
            <SimulationResults />
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Urban Infrastructure Failure Simulator • Sharjah Municipality • Built with Next.js & Prisma
        </div>
      </footer>

      {/* Asset Detail Modal */}
      <AssetDetailModal
        asset={selectedAsset}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onRunSimulation={() => {
          setDetailOpen(false);
          setActiveTab('simulations');
        }}
      />
    </div>
  );
}
