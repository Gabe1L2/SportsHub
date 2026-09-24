# MonsterASP.NET Deployment

Production is one MonsterASP.NET website containing the ASP.NET API and compiled React assets, connected to one Monster SQL Server database. GitHub's **Deploy Production** workflow is manual (`workflow_dispatch`) and uses WebDeploy. WebDeploy does not directly run EF tooling, but the deployed application applies pending migrations when it starts.

## Manual Configuration Checklist

### Codex created

- One .NET 10 solution with Domain, Infrastructure, API, React Web, and safe test projects.
- SQL Server EF Core model and initial migration using `sports`, `fantasy`, and `betting` schemas.
- Cookie Identity, Admin/User roles, antiforgery protection, admin bootstrap, and admin user creation.
- Vite production integration and ASP.NET SPA fallback with `/api` isolation.
- CI and manually triggered WebDeploy workflows.

### You must configure externally

- [ ] Create/sign in to a MonsterASP.NET account.
- [ ] Create one ASP.NET Core website—the only hosted website.
- [ ] Create one SQL Server database—the only application database, shared by local and production.
- [ ] Record the SQL hostname/server, database name, username, password, and provider connection-string requirements.
- [ ] Enable remote SQL access if required; configure any IP restriction and verify your PC can connect.
- [ ] Set local `ConnectionStrings:DefaultConnection` with `dotnet user-secrets`.
- [ ] Set Monster `ConnectionStrings__DefaultConnection` to the same database.
- [ ] Set `BootstrapAdmin__Email` and `BootstrapAdmin__Password` for initial creation; remove the password after the Admin exists.
- [ ] Confirm `Database__ApplyMigrationsOnStartup=true` or omit the override to use the enabled application default; set it to `false` when startup must not change the schema.
- [ ] Activate/configure HTTPS for the website and verify redirects/cookies over HTTPS.
- [ ] Enable WebDeploy and download/view its publishing credentials. Do not commit a `.publishSettings` file.
- [ ] Add the four GitHub Actions secrets listed below.
- [ ] Install .NET 10 SDK, current Node.js LTS/npm, and Git locally. No local database server is needed.
- [ ] Configure or confirm Monster database backups before important migrations.

## Monster environment variables

- `ConnectionStrings__DefaultConnection`: real Monster SQL connection string.
- `BootstrapAdmin__Email`: first administrator email, until bootstrapped.
- `BootstrapAdmin__Password`: strong temporary value; remove after successful creation.
- `Database__ApplyMigrationsOnStartup`: optional override; startup migrations are enabled by default. Set `false` to disable them.
- `ASPNETCORE_ENVIRONMENT`: `Production` if the host does not already set it.

Restart the site after configuration changes. Never paste these values into source control or workflow logs.

## GitHub repository secrets

In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and create:

- `WEBSITE_NAME`: IIS/application name supplied by Monster.
- `SERVER_COMPUTER_NAME`: WebDeploy service endpoint/computer name from Monster publishing settings.
- `SERVER_USERNAME`: WebDeploy username.
- `SERVER_PASSWORD`: WebDeploy password.

Obtain all four from the MonsterASP.NET website's WebDeploy/publish profile area; do not guess them. Store only the values as secrets and do not commit the downloaded publishing profile.

## First deployment and migrations

Review the migration and take a Monster backup before deployment. Startup applies pending migrations automatically unless `Database__ApplyMigrationsOnStartup=false` is configured. If remote SQL permits, you may instead disable startup migrations and apply manually with `dotnet ef database update --project src/SportsHub.Infrastructure --startup-project src/SportsHub.Api`. Trigger **Deploy Production** only after confirming the migration is safe for the live database.

After deployment, verify HTTPS, `GET /api/health`, direct navigation to `/fantasy` and `/betting`, login/logout, Admin access, and that an unknown `/api/...` path returns an API 404 rather than the SPA.
