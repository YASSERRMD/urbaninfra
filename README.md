# Urban Infrastructure Failure Simulator

A production-ready infrastructure degradation and failure prediction platform.

This project was generated using Chat.z.ai Agent Mode powered by GLM-5.

## Overview

Urban Infrastructure Failure Simulator enables municipalities and engineering teams to simulate infrastructure degradation over time and predict potential failure windows for roads, bridges, pipelines, and drainage systems.

The system supports scenario branching, risk scoring, geographic visualization, and maintenance budget forecasting.

## Technology Stack

- Frontend: Next.js 16 (App Router)
- Backend: Next.js API Routes (Node.js runtime)
- ORM: Prisma
- Database: SQLite
- Caching: In-memory module
- Real-time: Socket.io
- Deployment: Docker

## Core Features

- Infrastructure asset management
- Rule-based degradation engine
- Multi-scenario simulation branching
- Risk threshold detection
- Maintenance priority ranking
- Budget projection
- Geographic heatmap visualization
- Real-time simulation progress updates
- Multi-tenant support
- Role-based access control
- Full audit trail

## Architecture Highlights

- Simulation runs stored as versioned records
- Worker thread execution for long-running simulations
- Cache invalidation strategy on asset changes
- Optimistic concurrency control
- Soft delete for non-financial records

## Deployment

Includes:
- Dockerfile
- docker-compose configuration
- Environment variable template
