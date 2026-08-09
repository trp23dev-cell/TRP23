using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace TrapMadeIt.UI
{
    public class CaseFileResult
    {
        public bool ok;
        public string error;
        public string trapStatement;
        public string trapAnswer;

        public static CaseFileResult Fail(string why) => new CaseFileResult { ok = false, error = why };
    }

    // Wire shapes. JsonUtility needs a concrete class per response and will not
    // read a bare dictionary, hence the mirrored nesting.
    [Serializable] class CfProgress { public string trapStatement; public string trapAnswer; }
    [Serializable] class CfProfile { public CfProgress progress; }
    [Serializable] class CfGetPayload { public bool ok; public string error; public CfProfile profile; }
    [Serializable] class CfPutPayload { public bool ok; public string error; public string trapStatement; public string trapAnswer; }

    /// <summary>
    /// The card the player writes on in Chapter 01 and is asked about in the
    /// final chapter.
    ///
    /// Reads the whole profile but WRITES through a narrow route
    /// (PUT /api/player/:id/case-file). That is not a style choice: the general
    /// profile route replaces `progress` wholesale, so sending only these two
    /// fields would silently destroy the player's chapter, missions and
    /// everything else in there. The narrow route can only touch the card.
    ///
    /// The statement is private to its author. Do not surface it anywhere else.
    /// </summary>
    public class CaseFileService : MonoBehaviour
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

        string PlayerId() => session != null ? session.PlayerId : null;

        /// <summary>What the player wrote, if anything.</summary>
        public void Fetch(Action<CaseFileResult> done)
        {
            var id = PlayerId();
            if (string.IsNullOrEmpty(id))
            {
                done?.Invoke(CaseFileResult.Fail("sign in to open your case file"));
                return;
            }
            StartCoroutine(Send($"/api/player/{UnityWebRequest.EscapeURL(id)}", null, null, text =>
            {
                var p = JsonUtility.FromJson<CfGetPayload>(text);
                if (p == null || !p.ok) return CaseFileResult.Fail(p?.error ?? "could not read your case file");
                var pr = p.profile?.progress;
                return new CaseFileResult
                {
                    ok = true,
                    trapStatement = pr?.trapStatement ?? "",
                    trapAnswer = TrapMadeIt.CaseFile.TrapCardState.NormaliseAnswer(pr?.trapAnswer),
                };
            }, done));
        }

        /// <summary>Write the statement. Capped and trimmed again server-side.</summary>
        public void SaveStatement(string statement, Action<CaseFileResult> done)
        {
            var clean = TrapMadeIt.CaseFile.TrapCardState.Normalise(statement);
            if (string.IsNullOrEmpty(clean))
            {
                done?.Invoke(CaseFileResult.Fail("write something first — anything true"));
                return;
            }
            Put($"{{\"trapStatement\":{Quote(clean)}}}", done);
        }

        /// <summary>Answer the final chapter's question. "holds" or "freed".</summary>
        public void SaveAnswer(string answer, Action<CaseFileResult> done)
        {
            var clean = TrapMadeIt.CaseFile.TrapCardState.NormaliseAnswer(answer);
            if (clean == null)
            {
                done?.Invoke(CaseFileResult.Fail("that is not one of the answers"));
                return;
            }
            Put($"{{\"trapAnswer\":\"{clean}\"}}", done);
        }

        void Put(string body, Action<CaseFileResult> done)
        {
            var id = PlayerId();
            if (string.IsNullOrEmpty(id))
            {
                done?.Invoke(CaseFileResult.Fail("sign in to write on your case file"));
                return;
            }
            StartCoroutine(Send($"/api/player/{UnityWebRequest.EscapeURL(id)}/case-file",
                UnityWebRequest.kHttpVerbPUT, body, text =>
            {
                var p = JsonUtility.FromJson<CfPutPayload>(text);
                if (p == null || !p.ok) return CaseFileResult.Fail(p?.error ?? "could not save that");
                return new CaseFileResult
                {
                    ok = true,
                    trapStatement = p.trapStatement ?? "",
                    trapAnswer = TrapMadeIt.CaseFile.TrapCardState.NormaliseAnswer(p.trapAnswer),
                };
            }, done));
        }

        /// <summary>
        /// JSON string escaping. Hand-rolled because the payload is built by
        /// hand — and because a player writing `he said "I'm done"` on their
        /// own card must not produce a broken request. Covers what JSON
        /// requires: quotes, backslash, and the control characters.
        /// </summary>
        static string Quote(string s)
        {
            var sb = new StringBuilder(s.Length + 8);
            sb.Append('"');
            foreach (var c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        IEnumerator Send(string route, string verb, string json,
                         Func<string, CaseFileResult> parse, Action<CaseFileResult> done)
        {
            var url = Base + route;
            var method = verb ?? (json == null ? UnityWebRequest.kHttpVerbGET : UnityWebRequest.kHttpVerbPOST);

            using (var req = new UnityWebRequest(url, method))
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

                if (req.result == UnityWebRequest.Result.ConnectionError ||
                    req.result == UnityWebRequest.Result.DataProcessingError)
                {
                    done?.Invoke(CaseFileResult.Fail("cannot reach the server — check your connection"));
                    yield break;
                }

                var text = req.downloadHandler?.text;
                if (string.IsNullOrEmpty(text))
                {
                    done?.Invoke(CaseFileResult.Fail($"the server answered {req.responseCode} with nothing"));
                    yield break;
                }

                CaseFileResult result;
                try { result = parse(text); }
                catch (Exception e) { result = CaseFileResult.Fail($"could not read the reply: {e.Message}"); }

                if (!result.ok && req.responseCode == 401) result = CaseFileResult.Fail("signed out — sign in again");

                done?.Invoke(result);
            }
        }
    }
}
