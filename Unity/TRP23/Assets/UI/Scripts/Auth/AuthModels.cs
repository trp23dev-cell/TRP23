namespace TrapMadeIt.UI
{
    // Mirrors the web account shape (username/email/phone/2FA).
    public class Account
    {
        public string playerId;
        public string username;
        public string email;
        public string phone;
        public bool twofaEnabled;
        public bool isGuest;
    }

    public class SignupRequest
    {
        public string username;
        public string email;
        public string phone;
        public string password;
        public bool enable2fa;
    }

    public class AuthResult
    {
        public bool ok;
        public string error;
        public Account account;
        public string twofaSecret;   // set on register when 2FA was requested
        public bool twofaRequired;   // login needs a 2FA code

        public static AuthResult Fail(string message) => new AuthResult { ok = false, error = message };
    }
}
