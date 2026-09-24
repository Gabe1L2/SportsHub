using System.ComponentModel.DataAnnotations;
using SportsHub.Api.Features.Admin;

namespace SportsHub.Api.Tests;

public sealed class RequestValidationTests
{
    [Fact]
    public void CreateUserRequest_RejectsInvalidEmailAndShortPassword()
    {
        var request = new CreateUserRequest("not-an-email", "short");
        var results = new List<ValidationResult>();

        var valid = Validator.TryValidateObject(request, new ValidationContext(request), results, validateAllProperties: true);

        Assert.False(valid);
        Assert.Contains(results, result => result.MemberNames.Contains(nameof(CreateUserRequest.Email)));
        Assert.Contains(results, result => result.MemberNames.Contains(nameof(CreateUserRequest.Password)));
    }
}
