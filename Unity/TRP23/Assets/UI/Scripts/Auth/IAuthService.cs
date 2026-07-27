using System;

namespace TrapMadeIt.UI
{
    // Callback-based so a future real implementation can call the deployed
    // /api/players/* endpoints via UnityWebRequest without changing the UI.
    public interface IAuthService
    {
        Account Current { get; }
        void Register(SignupRequest request, Action<AuthResult> done);
        void Login(string identifier, string password, string code, Action<AuthResult> done);
        void EnableTwoFactor(string code, Action<AuthResult> done);
        void StartGuest(Action<AuthResult> done);
        void Logout(Action done);
    }
}
