using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SportsHub.Api.Infrastructure;
using SportsHub.Domain.Betting;
using SportsHub.Infrastructure.Persistence;

namespace SportsHub.Api.Features.Betting;

public sealed record BankrollTransactionRequest(
    Guid PlatformId,
    BankrollTransactionType Type,
    decimal Amount,
    DateTime? OccurredAtUtc,
    string? Note);
public sealed record BankrollAdjustmentRequest(decimal TargetBalance, DateTime? OccurredAtUtc, string? Note);
public sealed record ToolExpenseRequest(string ToolName, decimal Amount, DateTime? IncurredAtUtc, string? Note);
public sealed record BankrollTransactionResponse(
    Guid Id,
    BankrollTransactionType Type,
    PlatformResponse? Platform,
    decimal Amount,
    decimal? TargetBalance,
    DateTime OccurredAtUtc,
    string? Note);
public sealed record ToolExpenseResponse(Guid Id, string ToolName, decimal Amount, DateTime IncurredAtUtc, string? Note);
public sealed record BettingFinanceSummaryResponse(
    decimal BetProfit,
    decimal TotalDeposits,
    decimal TotalWithdrawals,
    decimal NetCashFlow,
    decimal TotalAdjustments,
    decimal CurrentBankroll,
    decimal TotalToolCosts,
    decimal OverallProfitAfterTools);
public sealed record BettingFinanceResponse(
    BettingFinanceSummaryResponse Summary,
    IReadOnlyList<BankrollTransactionResponse> Transactions,
    IReadOnlyList<ToolExpenseResponse> ToolExpenses,
    int TransactionCount,
    int ToolExpenseCount);

public static class BettingFinanceEndpoints
{
    public static RouteGroupBuilder MapBettingFinanceEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/finance", GetFinanceAsync);
        group.MapGet("/finance/summary", GetFinanceSummaryAsync);
        group.MapPost("/finance/transactions", CreateTransactionAsync).ValidateAntiforgery();
        group.MapPut("/finance/transactions/{id:guid}", UpdateTransactionAsync).ValidateAntiforgery();
        group.MapDelete("/finance/transactions/{id:guid}", DeleteTransactionAsync).ValidateAntiforgery();
        group.MapPost("/finance/reconcile", ReconcileBankrollAsync).ValidateAntiforgery();
        group.MapPost("/finance/tool-expenses", CreateToolExpenseAsync).ValidateAntiforgery();
        group.MapPut("/finance/tool-expenses/{id:guid}", UpdateToolExpenseAsync).ValidateAntiforgery();
        group.MapDelete("/finance/tool-expenses/{id:guid}", DeleteToolExpenseAsync).ValidateAntiforgery();
        return group;
    }

    private static async Task<IResult> GetFinanceSummaryAsync(
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken) =>
        Results.Ok(await BuildSummaryAsync(UserId(principal), db, cancellationToken));

    private static async Task<IResult> GetFinanceAsync(
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken = default)
    {
        var userId = UserId(principal);
        var summary = await BuildSummaryAsync(userId, db, cancellationToken);
        var transactionCount = await db.BankrollTransactions.CountAsync(x => x.UserId == userId, cancellationToken);
        var toolExpenseCount = await db.BettingToolExpenses.CountAsync(x => x.UserId == userId, cancellationToken);
        var transactions = await db.BankrollTransactions.AsNoTracking()
            .Include(x => x.Platform)
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.OccurredAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        var expenses = await db.BettingToolExpenses.AsNoTracking()
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.IncurredAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return Results.Ok(new BettingFinanceResponse(
            summary,
            transactions.Select(ToResponse).ToArray(),
            expenses.Select(ToResponse).ToArray(),
            transactionCount,
            toolExpenseCount));
    }

    private static async Task<IResult> CreateTransactionAsync(
        BankrollTransactionRequest request,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var validation = await ValidateTransactionAsync(request, db, cancellationToken);
        if (validation is not null) return validation;
        var now = DateTime.UtcNow;
        var transaction = new BankrollTransaction
        {
            UserId = UserId(principal),
            PlatformId = request.PlatformId,
            Type = request.Type,
            Amount = SignedAmount(request.Type, request.Amount),
            OccurredAtUtc = NormalizeUtc(request.OccurredAtUtc, now),
            Note = Clean(request.Note),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        db.BankrollTransactions.Add(transaction);
        await db.SaveChangesAsync(cancellationToken);
        await db.Entry(transaction).Reference(x => x.Platform).LoadAsync(cancellationToken);
        return Results.Created($"/api/betting/finance/transactions/{transaction.Id}", ToResponse(transaction));
    }

    private static async Task<IResult> UpdateTransactionAsync(
        Guid id,
        BankrollTransactionRequest request,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var transaction = await db.BankrollTransactions.Include(x => x.Platform)
            .SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (transaction is null) return Results.NotFound();
        if (transaction.Type == BankrollTransactionType.Adjustment)
            return Results.Conflict(new { title = "Reconciliation entries cannot be edited. Delete it and reconcile again." });
        var validation = await ValidateTransactionAsync(request, db, cancellationToken);
        if (validation is not null) return validation;
        transaction.PlatformId = request.PlatformId;
        transaction.Type = request.Type;
        transaction.Amount = SignedAmount(request.Type, request.Amount);
        transaction.OccurredAtUtc = NormalizeUtc(request.OccurredAtUtc, DateTime.UtcNow);
        transaction.Note = Clean(request.Note);
        transaction.TargetBalance = null;
        transaction.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await db.Entry(transaction).Reference(x => x.Platform).LoadAsync(cancellationToken);
        return Results.Ok(ToResponse(transaction));
    }

    private static async Task<IResult> DeleteTransactionAsync(
        Guid id,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var transaction = await db.BankrollTransactions.SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (transaction is null) return Results.NotFound();
        db.BankrollTransactions.Remove(transaction);
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> ReconcileBankrollAsync(
        BankrollAdjustmentRequest request,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        if (request.Note?.Length > 500) return Validation("note", "Notes cannot exceed 500 characters.");
        var userId = UserId(principal);
        var summary = await BuildSummaryAsync(userId, db, cancellationToken);
        var adjustmentAmount = decimal.Round(request.TargetBalance - summary.CurrentBankroll, 2, MidpointRounding.AwayFromZero);
        if (adjustmentAmount == 0m) return Results.Conflict(new { title = "The bankroll already matches that amount." });
        var now = DateTime.UtcNow;
        var transaction = new BankrollTransaction
        {
            UserId = userId,
            Type = BankrollTransactionType.Adjustment,
            Amount = adjustmentAmount,
            TargetBalance = request.TargetBalance,
            OccurredAtUtc = NormalizeUtc(request.OccurredAtUtc, now),
            Note = Clean(request.Note),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        db.BankrollTransactions.Add(transaction);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/betting/finance/transactions/{transaction.Id}", ToResponse(transaction));
    }

    private static async Task<IResult> CreateToolExpenseAsync(
        ToolExpenseRequest request,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var validation = ValidateExpense(request);
        if (validation is not null) return validation;
        var now = DateTime.UtcNow;
        var expense = new BettingToolExpense
        {
            UserId = UserId(principal),
            ToolName = request.ToolName.Trim(),
            Amount = decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero),
            IncurredAtUtc = NormalizeUtc(request.IncurredAtUtc, now),
            Note = Clean(request.Note),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        db.BettingToolExpenses.Add(expense);
        await db.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/betting/finance/tool-expenses/{expense.Id}", ToResponse(expense));
    }

    private static async Task<IResult> UpdateToolExpenseAsync(
        Guid id,
        ToolExpenseRequest request,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var expense = await db.BettingToolExpenses.SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (expense is null) return Results.NotFound();
        var validation = ValidateExpense(request);
        if (validation is not null) return validation;
        expense.ToolName = request.ToolName.Trim();
        expense.Amount = decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
        expense.IncurredAtUtc = NormalizeUtc(request.IncurredAtUtc, DateTime.UtcNow);
        expense.Note = Clean(request.Note);
        expense.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Results.Ok(ToResponse(expense));
    }

    private static async Task<IResult> DeleteToolExpenseAsync(
        Guid id,
        ClaimsPrincipal principal,
        SportsHubDbContext db,
        CancellationToken cancellationToken)
    {
        var expense = await db.BettingToolExpenses.SingleOrDefaultAsync(x => x.Id == id && x.UserId == UserId(principal), cancellationToken);
        if (expense is null) return Results.NotFound();
        db.BettingToolExpenses.Remove(expense);
        await db.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<BettingFinanceSummaryResponse> BuildSummaryAsync(string userId, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        var betProfit = await db.Bets.AsNoTracking()
            .Where(x => x.UserId == userId && x.Status != BetStatus.Pending && x.ActualPayout != null)
            .SumAsync(x => (decimal?)(x.ActualPayout!.Value - x.EntryCost), cancellationToken) ?? 0m;
        var deposits = await db.BankrollTransactions.AsNoTracking()
            .Where(x => x.UserId == userId && x.Type == BankrollTransactionType.Deposit)
            .SumAsync(x => (decimal?)(x.Amount < 0m ? -x.Amount : x.Amount), cancellationToken) ?? 0m;
        var withdrawals = await db.BankrollTransactions.AsNoTracking()
            .Where(x => x.UserId == userId && x.Type == BankrollTransactionType.Withdrawal)
            .SumAsync(x => (decimal?)(x.Amount < 0m ? -x.Amount : x.Amount), cancellationToken) ?? 0m;
        var adjustments = await db.BankrollTransactions.AsNoTracking()
            .Where(x => x.UserId == userId && x.Type == BankrollTransactionType.Adjustment)
            .SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0m;
        var toolCosts = await db.BettingToolExpenses.AsNoTracking()
            .Where(x => x.UserId == userId)
            .SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0m;
        var netCashFlow = deposits - withdrawals;
        return new BettingFinanceSummaryResponse(
            betProfit,
            deposits,
            withdrawals,
            netCashFlow,
            adjustments,
            BettingFinanceMath.CurrentBankroll(betProfit, deposits, withdrawals, adjustments),
            toolCosts,
            BettingFinanceMath.OverallProfitAfterTools(betProfit, toolCosts));
    }

    private static async Task<IResult?> ValidateTransactionAsync(BankrollTransactionRequest request, SportsHubDbContext db, CancellationToken cancellationToken)
    {
        if (request.Type is not (BankrollTransactionType.Deposit or BankrollTransactionType.Withdrawal))
            return Validation("type", "Cash transactions must be deposits or withdrawals.");
        if (request.Amount <= 0m) return Validation("amount", "Amount must be greater than zero.");
        if (request.Note?.Length > 500) return Validation("note", "Notes cannot exceed 500 characters.");
        if (!await db.BettingPlatforms.AnyAsync(x => x.Id == request.PlatformId, cancellationToken))
            return Validation("platformId", "Select a valid platform.");
        return null;
    }

    private static IResult? ValidateExpense(ToolExpenseRequest request)
    {
        var name = request.ToolName?.Trim() ?? string.Empty;
        if (name.Length is < 1 or > 160) return Validation("toolName", "Tool name is required and cannot exceed 160 characters.");
        if (request.Amount <= 0m) return Validation("amount", "Amount must be greater than zero.");
        if (request.Note?.Length > 500) return Validation("note", "Notes cannot exceed 500 characters.");
        return null;
    }

    private static decimal SignedAmount(BankrollTransactionType type, decimal amount) =>
        decimal.Round(BettingFinanceMath.LedgerAmount(type, amount), 2, MidpointRounding.AwayFromZero);

    private static BankrollTransactionResponse ToResponse(BankrollTransaction transaction) => new(
        transaction.Id,
        transaction.Type,
        transaction.Platform is null ? null : new PlatformResponse(transaction.Platform.Id, transaction.Platform.Name, transaction.Platform.Type, transaction.Platform.IsActive),
        BettingFinanceMath.LedgerAmount(transaction.Type, transaction.Amount),
        transaction.TargetBalance,
        AsUtc(transaction.OccurredAtUtc),
        transaction.Note);

    private static ToolExpenseResponse ToResponse(BettingToolExpense expense) =>
        new(expense.Id, expense.ToolName, expense.Amount, AsUtc(expense.IncurredAtUtc), expense.Note);

    private static IResult Validation(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static DateTime NormalizeUtc(DateTime? value, DateTime fallback) => value is null ? fallback : value.Value.ToUniversalTime();
    private static DateTime AsUtc(DateTime value) => value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
    private static string UserId(ClaimsPrincipal principal) => principal.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
