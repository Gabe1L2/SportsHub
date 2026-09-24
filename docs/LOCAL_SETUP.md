# Local Setup

Install .NET 10 SDK, a current Node.js LTS/npm, and Git on Windows 11. Do not install LocalDB, SQL Server Developer Edition, SQLite, PostgreSQL, or a database container for this application.

## Monster SQL remote access

From the MonsterASP.NET control panel, obtain the SQL Server hostname/server, database name, username, password, and any provider-required connection-string options. Confirm whether remote SQL access must be enabled and whether an IP allowlist applies. Add your current public IP if Monster requires it. Verify connectivity using Monster's documented SQL connectivity method before diagnosing the app.

Store the supplied connection string only in user-secrets:

```powershell
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=<host>;Database=<database>;User Id=<user>;Password=<password>;Encrypt=True;TrustServerCertificate=<provider-guidance>;" --project src/SportsHub.Api
```

The angle-bracket values are placeholders, not usable credentials. Do not put the completed string in an appsettings file, `.env`, command transcript, issue, or commit.

## First run

```powershell
dotnet restore SportsHub.sln
npm install --prefix src/SportsHub.Web
dotnet tool restore
dotnet user-secrets set "BootstrapAdmin:Email" "you@example.com" --project src/SportsHub.Api
dotnet user-secrets set "BootstrapAdmin:Password" "<strong unique password>" --project src/SportsHub.Api
```

Review `src/SportsHub.Infrastructure/Persistence/Migrations` and confirm a recent Monster backup before starting the API. Startup migrations are enabled, so API startup will apply pending migrations to the shared production database. To use the manual command instead, set `Database:ApplyMigrationsOnStartup` to `false` through user-secrets and run `dotnet ef database update --project src/SportsHub.Infrastructure --startup-project src/SportsHub.Api`. The amber development banner is a reminder that local actions affect production data.

On successful first startup, Identity creates the Admin/User roles if needed, creates the configured Admin if absent, and assigns Admin. It never logs the password. Remove `BootstrapAdmin:Password` from user-secrets after success. There is no public signup page or endpoint.
