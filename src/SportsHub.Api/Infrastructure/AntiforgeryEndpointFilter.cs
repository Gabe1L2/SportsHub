using Microsoft.AspNetCore.Antiforgery;

namespace SportsHub.Api.Infrastructure;

public static class AntiforgeryEndpointFilter
{
    public static RouteHandlerBuilder ValidateAntiforgery(this RouteHandlerBuilder builder) =>
        builder.AddEndpointFilter(async (context, next) =>
        {
            var antiforgery = context.HttpContext.RequestServices.GetRequiredService<IAntiforgery>();
            try
            {
                await antiforgery.ValidateRequestAsync(context.HttpContext);
            }
            catch (AntiforgeryValidationException)
            {
                return Results.BadRequest(new { error = "The antiforgery token is missing or invalid." });
            }
            return await next(context);
        });
}
