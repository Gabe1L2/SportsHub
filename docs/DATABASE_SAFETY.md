# Database Safety

## LOCAL DEVELOPMENT CONNECTS TO THE REAL PRODUCTION DATABASE.

There is exactly one application database: MonsterASP.NET SQL Server. Local API runs and the deployed site both read and write it. A local mistake is a production-data mistake.

- Do not run destructive scripts casually or use `database drop`.
- Never add startup code that deletes, resets, recreates, or broadly reseeds data.
- Review every generated migration, especially drops, incompatible type changes, and data-moving SQL.
- Create or confirm a recent MonsterASP.NET backup before major schema changes or risky operations.
- Double-check `UPDATE` and `DELETE` predicates; preview affected rows and important row counts first.
- Prefer an explicit transaction for risky one-time operations and verify counts before and after.
- Do not run tests that write to the database. CI has no database credentials and tests use no fake EF provider.
- Do not assume a backup makes destructive code safe. Understand restore availability and timing.

## Migration workflow

1. Commit code.
2. Verify backend/frontend builds and safe tests.
3. Generate and review the EF migration.
4. Create or confirm a recent MonsterASP.NET database backup.
5. Start the application to apply the migration automatically, or apply it manually if startup migrations were disabled.
6. Deploy the application if appropriate.
7. Verify login, health, and important module behavior after deployment.

`Database__ApplyMigrationsOnStartup` now defaults to `true`, so every application startup checks for and applies pending migrations. Review migrations and confirm a current backup before deploying or starting changed code. Set the variable to `false` in MonsterASP.NET when a deployment must start without changing the schema. Manual `dotnet ef database update` remains available from a trusted machine with remote access.
