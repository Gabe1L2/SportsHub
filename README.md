# SportsHub

SportsHub is a .NET 10 modular monolith containing a React SPA, an ASP.NET Core API, ASP.NET Core Identity, and one SQL Server database hosted by MonsterASP.NET. Fantasy Draft Helper and Sports Betting Tracker are modules of the same application—not separate sites or services.

> **Database warning:** local development intentionally connects to the same real MonsterASP.NET production database used by the deployed site. There is no local, development, test, staging, or preview database. Read [Database Safety](docs/DATABASE_SAFETY.md) before changing data or applying migrations.

## Repository

```text
src/
  SportsHub.Api/             ASP.NET entry point, endpoints, auth, static SPA hosting
  SportsHub.Domain/          Sports, fantasy, and betting domain models
  SportsHub.Infrastructure/  EF Core, Identity persistence, SQL Server migration
  SportsHub.Web/             React, TypeScript, Vite, Tailwind, TanStack Query
tests/
  SportsHub.Api.Tests/       Safe API-boundary unit tests
  SportsHub.Domain.Tests/    Pure domain tests
docs/                        Architecture, setup, deployment, database safety
.github/workflows/           CI and manual production deployment
```

## Quick start (Windows)

Prerequisites: .NET 10 SDK, current Node.js LTS/npm, and Git. No local database server is needed.

```powershell
dotnet restore SportsHub.sln
npm install --prefix src/SportsHub.Web
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "<Monster SQL Server connection string>" --project src/SportsHub.Api
dotnet user-secrets set "BootstrapAdmin:Email" "<admin email>" --project src/SportsHub.Api
dotnet user-secrets set "BootstrapAdmin:Password" "<strong temporary bootstrap password>" --project src/SportsHub.Api
```

Review the initial migration and confirm a MonsterASP.NET backup before starting the API. Startup migrations are enabled, so the first API start will apply it automatically. To apply it manually instead, first disable startup migrations and run:

```powershell
dotnet tool restore
dotnet ef database update --project src/SportsHub.Infrastructure --startup-project src/SportsHub.Api
```

In Visual Studio, set `SportsHub.Api` as the startup project, select the `https` profile, and press **F5**. The ASP.NET SPA proxy starts Vite automatically and opens the application.

The equivalent command-line workflow is:

```powershell
dotnet run --project src/SportsHub.Api --launch-profile https
```

The application opens at `http://localhost:5173`. Vite proxies `/api` to `https://localhost:7024`; application code always uses relative `/api/...` paths. Stop the ASP.NET debugging session to stop the Vite process it launched.

After the first administrator is created, remove the bootstrap password:

```powershell
dotnet user-secrets remove "BootstrapAdmin:Password" --project src/SportsHub.Api
```

## Build and test

```powershell
dotnet build SportsHub.sln
dotnet test SportsHub.sln --no-build
npm run build --prefix src/SportsHub.Web
npm test --prefix src/SportsHub.Web
dotnet publish src/SportsHub.Api/SportsHub.Api.csproj -c Release -o publish
```

The publish target runs `npm ci` and `npm run build` and places Vite output under the ASP.NET publish directory's `wwwroot`. Production needs only the ASP.NET application; Node is not a production runtime.

## Configuration

No secrets are committed. Local values use user-secrets; MonsterASP.NET uses environment variables with double underscores.

| Local user-secret key | Production environment variable | Purpose |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | `ConnectionStrings__DefaultConnection` | The same single Monster SQL database |
| `BootstrapAdmin:Email` | `BootstrapAdmin__Email` | First administrator email |
| `BootstrapAdmin:Password` | `BootstrapAdmin__Password` | Temporary first administrator password |
| `Database:ApplyMigrationsOnStartup` | `Database__ApplyMigrationsOnStartup` | Startup migrations; enabled by default |

See [Local Setup](docs/LOCAL_SETUP.md), [Architecture](docs/ARCHITECTURE.md), [MonsterASP Deployment](docs/MONSTERASP_DEPLOYMENT.md), and [Database Safety](docs/DATABASE_SAFETY.md).
