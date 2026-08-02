using System;

namespace TrapMadeIt.UI
{
    // Mirrors the web account shape (username/email/phone/2FA).
    //
    // [Serializable] is not decoration here. Unity's JsonUtility quietly returns
    // an object with every field at its default unless the type is marked, so a
    // perfectly good reply reads as "the server sent nothing".
    [Serializable]
    public class Account
    {
        public string playerId;
        public string username;
        public string email;
        public string phone;
        public bool twofaEnabled;
        public bool isGuest;
    }

    [Serializable]
    public class SignupRequest
    {
        public string username;
        public string email;
        public string phone;
        public string password;
        public bool enable2fa;
    }

    /// <summary>
    /// Two-factor details: returned by register when 2FA was asked for, and by
    /// /api/players/2fa/setup. `secret` is what goes into an authenticator app;
    /// `otpauthUrl` is the same thing in QR-code form.
    /// </summary>
    [Serializable]
    public class TwoFactorSetup
    {
        public string secret;
        public string otpauthUrl;
        public bool pending;
    }

    [Serializable]
    public class AuthResult
    {
        public bool ok;
        public string error;
        public Account account;

        // These names match the server's JSON exactly. JsonUtility maps by name
        // and says nothing when one does not line up — it just leaves the value
        // empty — so a rename on either side has to be made on both.
        public string playerId;
        public string token;         // session token, sent as Bearer afterwards
        public string expiresAt;
        public TwoFactorSetup twofa; // register, when 2FA was requested
        public string secret;        // /api/players/2fa/setup
        public bool twofaRequired;   // login needs a 2FA code

        public static AuthResult Fail(string message) => new AuthResult { ok = false, error = message };
    }
}
