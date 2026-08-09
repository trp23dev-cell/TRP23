using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace TrapMadeIt.UI
{
    [Serializable]
    public class Balances
    {
        public int cash;
        public int bank;
    }

    [Serializable]
    public class WalletResult
    {
        public bool ok;
        public string error;
        public Balances balances;

        public static WalletResult Fail(string why) => new WalletResult { ok = false, error = why };
    }

    // The wire shapes. JsonUtility needs a concrete class per response and
    // cannot be told to ignore what it does not recognise, so these list only
    // the fields we read.
    [Serializable] class Coins { public int coins; }
    [Serializable] class WalletPayload { public bool ok; public string error; public Coins wallet; public Coins bank; }
    [Serializable] class BankPayload { public bool ok; public string error; public int cash; public int bank; }

    /// <summary>
    /// The player's money, as the SERVER sees it.
    ///
    /// The HUD used to keep its own numbers -- 1600 coins, hardcoded, moved
    /// between two int fields. That is a display, not a bank: it forgets
    /// everything on quit, it disagrees with the web client, and anyone who can
    /// edit memory can grant themselves anything.
    ///
    /// The real ledger already exists server-side and is authoritative: every
    /// move is a double-entry transfer inside one SQL transaction, so a deposit
    /// cannot half-happen. Nothing here decides a balance. It asks, it shows
    /// what it is told, and when the server refuses -- not enough cash, not
    /// signed in -- it says so rather than pretending the move worked.
    /// </summary>
    public class WalletService : MonoBehaviour
    {
        // Handed in by GameContext at composition, never fetched. The service
        // used to call SceneFlow.Ensure() for both of these, which made the
        // network layer depend on the composition root while the composition
        // root built the network layer — the cycle that kept TRP23.Network
        // inside TRP23.UI (WP-U01 §2).
        TrapMadeIt.IApiEndpoint endpoint;
        TrapMadeIt.ISession session;

        /// <summary>Called once, by the composition root, before anything uses this.</summary>
        public void Bind(TrapMadeIt.IApiEndpoint apiEndpoint, TrapMadeIt.ISession playerSession)
        {
            endpoint = apiEndpoint;
            session = playerSession;
        }



        string Base => endpoint != null ? endpoint.BaseUrl : "";

        /// <summary>Current balances. Also the way to find out you are signed out.</summary>
        public void Fetch(Action<WalletResult> done)
        {
            var id = PlayerId();
            if (string.IsNullOrEmpty(id))
            {
                done?.Invoke(WalletResult.Fail("sign in to use the bank"));
                return;
            }
            StartCoroutine(Send($"/api/wallet/{UnityWebRequest.EscapeURL(id)}", null, text =>
            {
                var p = JsonUtility.FromJson<WalletPayload>(text);
                if (p == null || !p.ok) return WalletResult.Fail(p?.error ?? "could not read the wallet");
                return new WalletResult
                {
                    ok = true,
                    balances = new Balances
                    {
                        cash = p.wallet != null ? p.wallet.coins : 0,
                        bank = p.bank != null ? p.bank.coins : 0,
                    },
                };
            }, done));
        }

        public void Deposit(int amount, Action<WalletResult> done) => Move("deposit", amount, done);
        public void Withdraw(int amount, Action<WalletResult> done) => Move("withdraw", amount, done);

        void Move(string which, int amount, Action<WalletResult> done)
        {
            if (amount <= 0)
            {
                done?.Invoke(WalletResult.Fail("enter an amount above zero"));
                return;
            }
            var id = PlayerId();
            if (string.IsNullOrEmpty(id))
            {
                done?.Invoke(WalletResult.Fail("sign in to use the bank"));
                return;
            }

            // The server takes the acting player from the session token, not
            // from this field, so a forged id here buys nothing. It is sent
            // because the route accepts it for the web client's benefit.
            var body = $"{{\"playerId\":\"{id}\",\"amount\":{amount}}}";
            StartCoroutine(Send($"/api/bank/{which}", body, text =>
            {
                var p = JsonUtility.FromJson<BankPayload>(text);
                if (p == null || !p.ok) return WalletResult.Fail(p?.error ?? "the bank refused that");
                return new WalletResult
                {
                    ok = true,
                    balances = new Balances { cash = p.cash, bank = p.bank },
                };
            }, done));
        }

        string PlayerId() => session != null ? session.PlayerId : null;

        IEnumerator Send(string route, string json, Func<string, WalletResult> parse,
                         Action<WalletResult> done)
        {
            var url = Base + route;
            var verb = json == null ? UnityWebRequest.kHttpVerbGET : UnityWebRequest.kHttpVerbPOST;

            using (var req = new UnityWebRequest(url, verb))
            {
                if (json != null)
                {
                    req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                    req.SetRequestHeader("Content-Type", "application/json");
                }
                req.downloadHandler = new DownloadHandlerBuffer();

                var token = session != null ? session.Token : null;
                if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("Authorization", "Bearer " + token);

                yield return req.SendWebRequest();

                // Being unable to reach the bank is a different problem from
                // being told no, and the player can act on one of them.
                if (req.result == UnityWebRequest.Result.ConnectionError ||
                    req.result == UnityWebRequest.Result.DataProcessingError)
                {
                    done?.Invoke(WalletResult.Fail("cannot reach the bank — check your connection"));
                    yield break;
                }

                var text = req.downloadHandler?.text;
                if (string.IsNullOrEmpty(text))
                {
                    done?.Invoke(WalletResult.Fail($"the bank answered {req.responseCode} with nothing"));
                    yield break;
                }

                WalletResult result;
                try { result = parse(text); }
                catch (Exception e) { result = WalletResult.Fail($"could not read the reply: {e.Message}"); }

                // 401 means the session has gone, which is worth saying plainly
                // rather than reporting as a bank error.
                if (!result.ok && req.responseCode == 401) result = WalletResult.Fail("signed out — sign in again");

                done?.Invoke(result);
            }
        }
    }
}
