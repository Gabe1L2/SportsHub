# Architecture

SportsHub is a pragmatic modular monolith: one React SPA, one ASP.NET Core application, one authentication system, and one MonsterASP.NET SQL Server database. ASP.NET owns `/api/*`, serves Vite's static production assets, and falls back to `index.html` for client routes. A specific unmatched `/api/{**unmatched}` route returns JSON 404s before the SPA fallback.

## Modules

- **Identity** uses ASP.NET Core Identity in `dbo`. Registration is not public; an Admin creates users.
- **Sports** stores canonical sports, leagues, teams, players, providers, and external player IDs in the `sports` schema.
- **Fantasy** stores projection sources, projections, drafts, and draft picks in the `fantasy` schema.
- **Betting** stores sportsbooks, bets, bet legs, bankroll accounts, and transactions in the `betting` schema.

A player exists once in Sports. Fantasy projections/draft picks and betting player props reference that canonical record. `Provider` and `PlayerExternalId` leave a deliberate path for imports and identity matching without prematurely building a resolution engine.

User-owned records have server-controlled Identity user foreign keys. Endpoints obtain the user ID from authenticated claims and never accept ownership from request data. Historical relationships use restrictive deletion where losing history would be risky.

## Authentication and CSRF

Identity uses an HttpOnly cookie with SameSite Lax, sliding expiration, and Secure always in production. API authorization failures return 401/403 rather than HTML redirects. The SPA obtains an antiforgery request token from `/api/account/antiforgery` and sends it in `X-XSRF-TOKEN` for state-changing requests. Login, logout, and Admin user creation validate it. Admin endpoints require the `Admin` role.

## Environments and database

There are only two execution environments: local development and MonsterASP.NET production. **There is intentionally no second development database.** Both executions use the same MonsterASP.NET production SQL Server database. Configuration differs only in secret source: .NET user-secrets locally and Monster environment variables in production.

EF Core never calls `EnsureCreated`. Pending migrations are applied during application startup because `Database:ApplyMigrationsOnStartup` is enabled by default. The setting can be overridden with `Database__ApplyMigrationsOnStartup=false` when a deployment must start without changing the schema.
