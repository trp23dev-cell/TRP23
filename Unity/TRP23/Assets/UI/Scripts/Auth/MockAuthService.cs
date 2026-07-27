using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace TrapMadeIt.UI
{
    // In-memory stand-in for the real backend. Enforces the same signup rules as
    // the web/backend so the flow behaves identically. Holds nothing on disk, so
    // guests are fresh each run — matching the web's ephemeral guest.
    public class MockAuthService : IAuthService
    {
        private class Stored { public Account acct; public string password; public bool has2fa; }

        private readonly Dictionary<string, Stored> _byUser = new Dictionary<string, Stored>();
        private readonly Dictionary<string, Stored> _byEmail = new Dictionary<string, Stored>();
        private static readonly Regex UserRe = new Regex("^[a-zA-Z0-9_]{3,20}$");
        private static readonly Regex EmailRe = new Regex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");
        private int _guestSeq;

        public Account Current { get; private set; }

        public void Register(SignupRequest r, Action<AuthResult> done)
        {
            if (r == null || !UserRe.IsMatch(r.username ?? "")) { done(AuthResult.Fail("username must be 3-20 letters, numbers or _")); return; }
            if (!EmailRe.IsMatch(r.email ?? "")) { done(AuthResult.Fail("a valid email is required")); return; }
            if ((r.password ?? "").Length < 8) { done(AuthResult.Fail("password must be at least 8 characters")); return; }
            if (_byEmail.ContainsKey(r.email.ToLower())) { done(AuthResult.Fail("an account with this email already exists")); return; }
            if (_byUser.ContainsKey(r.username.ToLower())) { done(AuthResult.Fail("that username is taken")); return; }

            var acct = new Account {
                playerId = "p_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                username = r.username, email = r.email, phone = r.phone,
                twofaEnabled = false, isGuest = false
            };
            var s = new Stored { acct = acct, password = r.password };
            _byUser[r.username.ToLower()] = s;
            _byEmail[r.email.ToLower()] = s;
            Current = acct;

            var res = new AuthResult { ok = true, account = acct };
            if (r.enable2fa) { s.has2fa = true; res.twofaSecret = GenSecret(); }
            done(res);
        }

        public void Login(string identifier, string password, string code, Action<AuthResult> done)
        {
            var id = (identifier ?? "").ToLower();
            Stored s = _byUser.TryGetValue(id, out var a) ? a : (_byEmail.TryGetValue(id, out var b) ? b : null);
            if (s == null || s.password != password) { done(AuthResult.Fail("invalid credentials")); return; }
            if (s.acct.twofaEnabled)
            {
                if (string.IsNullOrEmpty(code)) { var rr = AuthResult.Fail("two-factor code required"); rr.twofaRequired = true; done(rr); return; }
                if (code.Length != 6) { var rr = AuthResult.Fail("invalid two-factor code"); rr.twofaRequired = true; done(rr); return; }
            }
            Current = s.acct;
            done(new AuthResult { ok = true, account = s.acct });
        }

        public void EnableTwoFactor(string code, Action<AuthResult> done)
        {
            if (Current == null) { done(AuthResult.Fail("not signed in")); return; }
            if ((code ?? "").Length != 6) { done(AuthResult.Fail("invalid code — check your authenticator app")); return; }
            Current.twofaEnabled = true;
            done(new AuthResult { ok = true, account = Current });
        }

        public void StartGuest(Action<AuthResult> done)
        {
            Current = new Account {
                playerId = "guest_" + (++_guestSeq) + "_" + Guid.NewGuid().ToString("N").Substring(0, 6),
                username = null, isGuest = true, twofaEnabled = false
            };
            done(new AuthResult { ok = true, account = Current });
        }

        public void Logout(Action done) { Current = null; done?.Invoke(); }

        private static string GenSecret()
        {
            const string A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            var r = new System.Random();
            var c = new char[16];
            for (int i = 0; i < 16; i++) c[i] = A[r.Next(A.Length)];
            return new string(c);
        }
    }
}
