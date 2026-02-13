import { Server } from 'socket.io';

const PORT = 3003;

// In-memory store for simulation states
const simulationStates = new Map<string, {
  status: string;
  progress: number;
  results: unknown[];
  error?: string;
}>();

const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

console.log(`Simulation WebSocket service running on port ${PORT}`);

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join tenant room for multi-tenant isolation
  socket.on('join-tenant', (tenantId: string) => {
    socket.join(`tenant:${tenantId}`);
    console.log(`Socket ${socket.id} joined tenant ${tenantId}`);
  });

  // Subscribe to simulation updates
  socket.on('subscribe-simulation', (simulationId: string) => {
    socket.join(`simulation:${simulationId}`);
    console.log(`Socket ${socket.id} subscribed to simulation ${simulationId}`);
    
    // Send current state if exists
    const state = simulationStates.get(simulationId);
    if (state) {
      socket.emit('simulation-state', { simulationId, ...state });
    }
  });

  // Unsubscribe from simulation
  socket.on('unsubscribe-simulation', (simulationId: string) => {
    socket.leave(`simulation:${simulationId}`);
  });

  // Start a simulation (this would typically trigger backend processing)
  socket.on('start-simulation', async (data: {
    simulationId: string;
    tenantId: string;
    config: {
      assetId: string;
      yearsToSimulate: number;
      scenarioType: string;
    };
  }) => {
    console.log(`Starting simulation ${data.simulationId}`);
    
    // Initialize state
    simulationStates.set(data.simulationId, {
      status: 'running',
      progress: 0,
      results: [],
    });

    // Notify subscribers
    io.to(`simulation:${data.simulationId}`).emit('simulation-started', {
      simulationId: data.simulationId,
      config: data.config,
    });

    // Simulate progress updates (in real implementation, this would be driven by actual computation)
    const totalMonths = data.config.yearsToSimulate * 12;
    
    for (let month = 1; month <= totalMonths; month++) {
      // Simulate computation delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      const progress = Math.round((month / totalMonths) * 100);
      const state = simulationStates.get(data.simulationId);
      
      if (state && state.status === 'running') {
        state.progress = progress;
        
        // Emit progress update
        io.to(`simulation:${data.simulationId}`).emit('simulation-progress', {
          simulationId: data.simulationId,
          month,
          progress,
        });
      } else {
        // Simulation was cancelled
        break;
      }
    }

    // Mark as completed
    const finalState = simulationStates.get(data.simulationId);
    if (finalState && finalState.status === 'running') {
      finalState.status = 'completed';
      finalState.progress = 100;
      
      io.to(`simulation:${data.simulationId}`).emit('simulation-completed', {
        simulationId: data.simulationId,
        completedAt: new Date().toISOString(),
      });
      
      // Also notify tenant room
      io.to(`tenant:${data.tenantId}`).emit('simulation-notification', {
        type: 'completed',
        simulationId: data.simulationId,
        message: 'Simulation completed successfully',
      });
    }
  });

  // Cancel a running simulation
  socket.on('cancel-simulation', (simulationId: string) => {
    const state = simulationStates.get(simulationId);
    if (state && state.status === 'running') {
      state.status = 'cancelled';
      state.error = 'Simulation cancelled by user';
      
      io.to(`simulation:${simulationId}`).emit('simulation-cancelled', {
        simulationId,
        reason: 'User cancelled',
      });
    }
  });

  // Real-time asset alerts
  socket.on('subscribe-alerts', (tenantId: string) => {
    socket.join(`alerts:${tenantId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Helper function to emit alerts (can be called from API routes)
export function emitAssetAlert(tenantId: string, alert: {
  type: 'warning' | 'critical' | 'info';
  assetId: string;
  assetName: string;
  message: string;
  data?: unknown;
}) {
  io.to(`alerts:${tenantId}`).emit('asset-alert', alert);
}

// Helper function to update simulation state
export function updateSimulationState(simulationId: string, update: Partial<{
  status: string;
  progress: number;
  results: unknown[];
  error: string;
}>) {
  const state = simulationStates.get(simulationId);
  if (state) {
    Object.assign(state, update);
    io.to(`simulation:${simulationId}`).emit('simulation-state', {
      simulationId,
      ...state,
    });
  }
}

export { io };
