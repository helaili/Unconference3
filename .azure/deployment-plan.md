# Azure Deployment Plan — Unconference3

## Status: In Progress

## Overview

Deploy the Nuxt 4 + PostgreSQL application to Azure Container Apps via GitHub Actions.

## Architecture

| Component | Azure Service | Notes |
|-----------|--------------|-------|
| Nuxt SSR app | Azure Container Apps | External ingress, port 3000 |
| PostgreSQL 17 | Azure Container Apps | Internal TCP ingress, port 5432, 1 replica |
| Container images | Azure Container Registry (Basic) | Managed-identity pull |
| Logs | Log Analytics Workspace | Attached to CAE |
| Auth | OIDC federated credentials | No stored passwords |

**Region:** North Europe (`northeurope`)

## Resources

| Resource | Name |
|----------|------|
| Resource Group | `rg-unconference` |
| Container Registry | `acrunconference` |
| Log Analytics | `log-unconference` |
| Managed Identity | `id-unconference` |
| Container Apps Env | `cae-unconference` |
| PostgreSQL app | `unconference-db` |
| Nuxt app | `unconference-app` |

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Service principal / app registration client ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `POSTGRES_PASSWORD` | PostgreSQL superuser password |
| `NUXT_SESSION_PASSWORD` | nuxt-auth-utils session encryption key (≥ 32 chars) |
| `NUXT_OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |

## Workflows

### `azure-infra.yml` — manual, one-time infrastructure setup
1. Create resource group
2. Create ACR
3. Create Log Analytics workspace
4. Create managed identity + assign AcrPull role
5. Create Container Apps environment
6. Create PostgreSQL container app (internal TCP)
7. Create Nuxt container app (external HTTP, placeholder image)

### `deploy.yml` — auto on push to `main`
1. Azure OIDC login
2. Docker build + push to ACR (tagged with commit SHA and `latest`)
3. `az containerapp update` with the new image

## Files Created

- `Dockerfile` — multi-stage build; bundles migration script for runtime
- `.dockerignore`
- `docker/entrypoint.sh` — runs migrations (with retry) then starts Nuxt
- `.github/workflows/azure-infra.yml`
- `.github/workflows/deploy.yml`

## Database Migrations

The migration script (`server/database/migrate.ts`) is bundled into
`server/database/migrate.mjs` during the Docker build using esbuild.
The entrypoint runs it before starting the Nuxt server, retrying up to 10
times to allow the PostgreSQL container app to become ready.

Internal DATABASE_URL:
`postgresql://postgres:<password>@unconference-db:5432/unconference`
