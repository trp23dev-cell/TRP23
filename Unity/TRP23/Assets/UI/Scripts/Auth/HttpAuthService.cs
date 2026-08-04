using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace TrapMadeIt.UI
{
    /// <summary>
    /// The real auth service: talks to the deployed /api/players/* endpoints.
    ///
    /// Drop-in replacement for MockAuthService — same IAuthService, so nothing
    /// in the UI changes. The server is the authority on accounts, wallets and
    /// progress; this only carries the session token that proves who is asking.
    ///
    /// The web client is the reference implementation of this contract. If a
    /// response shape ever looks wrong here, check server/mockApiServer.js
    /// rather than guessing — that file is the source of truth for both.
    /// </summary>
    public class HttpAuthService : MonoBehaviour, IAuthService
    {
        [Header("Where the API lives")]
        [Tooltip("No trailing slash. The production deployment, or http://localhost:8787 for local work.")]
        public string apiBase = "https://trp23-production.up.railway.app";

        // Session token from the server. Kept in PlayerPrefs so a returning
        // player is not asked to sign in again.
        //
        // PlayerPrefs is not a secret store — on a desktop build it is a plain
        // file the user can read. That is acceptable for a session token: it
        // expires, it only grants that one player's own account, and the
        // alternative is asking for a password on every launch. It would NOT be
        // acceptable for a password, which is why none is ever stored.
        const string TokenKey = "trp23.session.token";

        Account current;
        public Account Current => current;

        string Token
        {
            get => PlayerPrefs.GetString(TokenKey, null);
            set
            {
                if (string.IsNullOrEmpty(value)) PlayerPrefs.DeleteKey(TokenKey);
                else PlayerPrefs.SetString(TokenKey, value);
                PlayerPrefs.Save();
            }
        }

        // ---------------------------------------------------------------- api

        public void Register(SignupRequest request, Action<AuthResult> done)
        {
            if (request == null) { done?.Invoke(AuthResult.Fail("no details given")); return; }
            StartCoroutine(Post("/api/players/register", JsonUtility.ToJson(request), (res) =>
            {
                if (!res.ok) { done?.Invoke(res); return; }
                Adopt(res);
                done?.Invoke(res);
            }));
        }

        public void Login(string identifier, string password, string code, Action<AuthResult> done)
        {
            var body = JsonUtility.ToJson(new LoginBody
            {
                identifier = identifier,
                password = password,
                code = code ?? string.Empty,
            });
            StartCoroutine(Post("/api/players/login", body, (res) =>
            {
                if (res.ok) Adopt(res);
                done?.Invoke(res);
            }));
        }

        public void EnableTwoFactor(string code, Action<AuthResult> done)
        {
            var body = JsonUtility.ToJson(new CodeBody { code = code });
            StartCoroutine(Post("/api/players/2fa/enable", body, done));
        }

        /// <summary>
        /// Play without an account. The server still issues a real player id and
        /// token — a guest is a proper player record, just without credentials,
        /// so their coins and progress survive and can be claimed later.
        /// </summary>
        public void StartGuest(Action<AuthResult> done)
        {
            StartCoroutine(Post("/api/players/session", "{}", (res) =>
            {
                if (res.ok)
                {
                    Adopt(res);
                    if (current != null) current.isGuest = true;
                }
                done?.Invoke(res);
            }));
        }

        public void Logout(Action done)
        {
            StartCoroutine(Post("/api/players/logout", "{}", (_) =>
            {
                Token = null;
                current = null;
                done?.Invoke();
            }));
        }

        // ------------------------------------------------------------ plumbing

        void Adopt(AuthResult res)
        {
            if (!string.IsNullOrEmpty(res.token)) Token = res.token;
            if (res.account != null) { current = res.account; return; }

            // A guest has no account, by definition. /api/players/session
            // answers with a playerId and a token and nothing else, so the
            // check above never fired and `current` stayed null — which left
            // the session perfectly valid and every service unable to name the
            // player it belonged to. The case file said "sign in to write on
            // your case file" to somebody who had, and the bank was just as
            // broken for the same reason.
            //
            // The top-level playerId is the account, for a guest.
            if (!string.IsNullOrEmpty(res.playerId))
            {
                current = new Account { playerId = res.playerId, isGuest = true };
            }
        }

        IEnumerator Post(string route, string json, Action<AuthResult> done)
        {
            var url = apiBase.TrimEnd('/') + route;
            using (var req = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json ?? "{}"));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                var token = Token;
                if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("Authorization", "Bearer " + token);

                yield return req.SendWebRequest();

                var text = req.downloadHandler?.text;

                // A connection failure is not the same as a rejection, and the
                // player should be told which. "Wrong password" and "no
                // internet" need different reactions.
                if (req.result == UnityWebRequest.Result.ConnectionError ||
                    req.result == UnityWebRequest.Result.DataProcessingError)
                {
                    done?.Invoke(AuthResult.Fail("cannot reach the server — check your connection"));
                    yield break;
                }

                // The server rate limits sign-ins and registrations. Passing its
                // own message through matters: "too many attempts, slow down"
                // is actionable, a generic failure is not.
                if (req.responseCode == 429)
                {
                    done?.Invoke(AuthResult.Fail(Describe(text) ?? "too many attempts, slow down"));
                    yield break;
                }

                if (string.IsNullOrEmpty(text))
                {
                    done?.Invoke(AuthResult.Fail($"the server answered {req.responseCode} with nothing"));
                    yield break;
                }

                AuthResult parsed = null;
                try { parsed = JsonUtility.FromJson<AuthResult>(text); }
                catch (Exception e) { Debug.LogWarning($"[auth] could not read the reply: {e.Message}"); }

                if (parsed == null)
                {
                    done?.Invoke(AuthResult.Fail("the server sent something unreadable"));
                    yield break;
                }

                // JsonUtility leaves ok=false when the field is absent, so an
                // HTTP failure with no ok field still reads as a failure.
                if (!parsed.ok && string.IsNullOrEmpty(parsed.error))
                {
                    parsed.error = $"request failed ({req.responseCode})";
                }
                done?.Invoke(parsed);
            }
        }

        static string Describe(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            try { return JsonUtility.FromJson<AuthResult>(json)?.error; }
            catch { return null; }
        }

        // JsonUtility only serialises fields on concrete classes, so the request
        // bodies need types rather than anonymous objects.
        [Serializable] class LoginBody { public string identifier; public string password; public string code; }
        [Serializable] class CodeBody { public string code; }
    }
}
