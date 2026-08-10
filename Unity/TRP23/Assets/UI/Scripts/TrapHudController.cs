using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.UI
{
    [RequireComponent(typeof(UIDocument))]
    public class TrapHudController : MonoBehaviour
    {
        private VisualElement _root;
        private IAuthService _auth;

        // Balances as last reported BY THE SERVER. Never adjusted locally:
        // these are a display of the ledger, not a copy of it that could drift
        // away from it. Every change comes back from a request.
        private int _cash;
        private int _bank;
        private bool _haveBalances;
        private WalletService _wallet;
        private TrapCardController _caseFile;
        private TrapMadeIt.UI.Phone.PhoneController _phone;

        // Which chapter the player is in, and how many there are. Hardcoded
        // until Unity has the chapter flow — the card only needs to know
        // "first", "middle" or "last", and wiring it to a chapter system that
        // does not exist yet would be inventing an interface for nothing.
        private int _level;
        private const int LastLevel = 5;
        private readonly HashSet<string> _owned = new HashSet<string>();

        private struct Drop { public string id, name; public int price; public Drop(string i, string n, int p) { id = i; name = n; price = p; } }
        private static readonly Drop[] Catalog = {
            new Drop("chain", "CHAIN DETAIL SET", 1250),
            new Drop("star",  "STAR PATCH SET",   1400),
            new Drop("cross", "CROSS RHINESTONE", 1350),
        };

        private void OnEnable()
        {
            _root = GetComponent<UIDocument>().rootVisualElement;
            var context = GameContext.Current;
            _auth = context.Auth;

            // Taken from the context, not built here. The HUD used to
            // GetComponent-or-AddComponent both of these onto the persistent
            // object, which meant a screen was deciding what services exist and
            // wiring them itself — so whether they were configured depended on
            // which screen opened first. GameContext composes them once, before
            // any screen runs.
            _wallet = context.Wallet;
            _caseFile = new TrapCardController(_root, context.CaseFile);

            // The Phone links to the case file rather than reimplementing it —
            // see MissionsApp. Handing it the same TogglePanel path the C key
            // uses means there is one way in, however it was asked for.
            _phone = new TrapMadeIt.UI.Phone.PhoneController(_root, () =>
            {
                ShowPanel("panel-casefile", true);
                _caseFile.Show(_level, LastLevel);
            });
            // Never two full-screen surfaces at once. The registers would cope,
            // but the player would be looking at a panel through a phone.
            _phone.Opened += CloseAllPanels;
            // Opening the Phone is the moment its balance stops being stale, so
            // that is when to ask. Cheap, and it means the Wallet app is right
            // without polling anything.
            _phone.Opened += () => Reload(null);

            _root.Q<Button>("open-store").clicked += () => ShowPanel("panel-store", true);
            // Open first, then reload: the panel should appear at once and fill
            // in, rather than hanging on the network before it shows at all.
            _root.Q<Button>("open-bank").clicked += () => { ShowPanel("panel-bank", true); Reload(null); };
            _root.Q<Button>("open-account").clicked += () => { RefreshAccount(); ShowPanel("panel-account", true); };
            _root.Q<Button>("open-casefile").clicked += () => { ShowPanel("panel-casefile", true); _caseFile.Show(_level, LastLevel); };

            _root.Q<Button>("casefile-close").clicked += () => ShowPanel("panel-casefile", false);
            _root.Q<Button>("store-close").clicked += () => ShowPanel("panel-store", false);
            _root.Q<Button>("bank-close").clicked += () => ShowPanel("panel-bank", false);
            _root.Q<Button>("account-close").clicked += () => ShowPanel("panel-account", false);

            _root.Q<Button>("bank-deposit").clicked += () => Move(true);
            _root.Q<Button>("bank-withdraw").clicked += () => Move(false);
            _root.Q<Button>("account-logout").clicked += OnLogout;

            BuildStore();
            RefreshCoins();
            RefreshChip();
            Reload(null);
        }

        /// Ask the server what the player actually has.
        private void Reload(System.Action after)
        {
            _wallet.Fetch(r =>
            {
                if (r.ok && r.balances != null)
                {
                    _cash = r.balances.cash;
                    _bank = r.balances.bank;
                    _haveBalances = true;
                }
                else
                {
                    // Say why rather than showing a confident zero. A guest with
                    // no account has no wallet, and that is worth stating.
                    _haveBalances = false;
                    Msg("bank-msg", r.error ?? "could not reach the bank", "err");
                }
                RefreshCoins();
                RefreshBankLabels();
                after?.Invoke();
            });
        }

        private void RefreshCoins()
        {
            _root.Q<Label>("coin-amt").text = _haveBalances ? _cash.ToString("N0") : "—";
            // One paint site for balances, so the Phone cannot show a number the
            // HUD has already moved on from. It is pushed what the server said,
            // never allowed to work anything out.
            _phone?.SetBalances(_cash, _bank, _haveBalances);
        }

        private void RefreshChip()
        {
            var a = _auth != null ? _auth.Current : null;
            _root.Q<Button>("open-account").text = (a != null && !string.IsNullOrEmpty(a.username)) ? a.username : "GUEST";
        }

        private void BuildStore()
        {
            var grid = _root.Q<VisualElement>("store-grid");
            grid.Clear();
            foreach (var d in Catalog)
            {
                var card = new VisualElement(); card.AddToClassList("store-card");
                var name = new Label(d.name); name.AddToClassList("sc-name");
                var price = new Label(d.price.ToString("N0") + "  COINS"); price.AddToClassList("sc-price");
                var buy = new Button { text = _owned.Contains(d.id) ? "✓ IN CLOSET" : "BUY" };
                buy.AddToClassList("btn-gold");
                buy.style.marginTop = 8;
                var drop = d;
                buy.clicked += () => Buy(drop, buy);
                buy.SetEnabled(!_owned.Contains(d.id));
                card.Add(name); card.Add(price); card.Add(buy);
                grid.Add(card);
            }
        }

        /// <summary>
        /// Not wired up, and now says so.
        ///
        /// This used to subtract from a local coin counter, which was harmless
        /// while that counter was made up. It is not harmless now the balance
        /// comes from the server's ledger: the number would drop here, the
        /// ledger would not agree, and the next refresh would silently put it
        /// back. Better to do nothing and say why than to look like it worked.
        ///
        /// The server has /api/commerce/checkout, but it takes real drop ids
        /// and prices from the catalogue, and this list is three hardcoded
        /// strings that match nothing. Connecting it is the same job the bank
        /// just had.
        /// </summary>
        private void Buy(Drop d, Button buy)
        {
            Msg("store-msg", "The store is not connected to the ledger yet — " +
                             "the bank is, if you want to move money.", "err");
        }

        private void RefreshBankLabels()
        {
            var cash = _root.Q<Label>("bank-cash");
            var saved = _root.Q<Label>("bank-saved");
            if (cash != null) cash.text = _haveBalances ? _cash.ToString("N0") : "—";
            if (saved != null) saved.text = _haveBalances ? _bank.ToString("N0") : "—";
        }

        /// <summary>
        /// Move money, and let the SERVER decide whether it is allowed.
        ///
        /// The amount is still checked here, but only to save a pointless round
        /// trip on an obvious mistake. The refusal that matters comes from the
        /// ledger: this client's idea of the balance can be stale -- another
        /// device, the web client, a mission payout -- and acting on it would
        /// let a deposit "succeed" here and not there.
        /// </summary>
        private void Move(bool deposit)
        {
            int amt;
            if (!int.TryParse(_root.Q<TextField>("bank-amount").value.Trim(), out amt) || amt <= 0)
            { Msg("bank-msg", "Enter a valid amount.", "err"); return; }

            SetBankButtons(false);
            Msg("bank-msg", deposit ? "Depositing…" : "Withdrawing…", null);

            System.Action<WalletResult> handle = r =>
            {
                SetBankButtons(true);
                if (!r.ok)
                {
                    Msg("bank-msg", r.error ?? "that did not go through", "err");
                    return;
                }
                _cash = r.balances.cash;
                _bank = r.balances.bank;
                _haveBalances = true;
                RefreshBankLabels();
                RefreshCoins();
                _root.Q<TextField>("bank-amount").value = "";
                Msg("bank-msg", (deposit ? "Deposited " : "Withdrew ") + amt.ToString("N0") + ".", "ok");
            };

            if (deposit) _wallet.Deposit(amt, handle);
            else _wallet.Withdraw(amt, handle);
        }

        /// Locked while a transfer is in flight, so an impatient double-click
        /// cannot send the same deposit twice.
        private void SetBankButtons(bool on)
        {
            _root.Q<Button>("bank-deposit")?.SetEnabled(on);
            _root.Q<Button>("bank-withdraw")?.SetEnabled(on);
        }

        private void RefreshAccount()
        {
            var a = _auth != null ? _auth.Current : null;
            _root.Q<Label>("account-title").text = (a != null && !string.IsNullOrEmpty(a.username)) ? a.username : "GUEST";
            _root.Q<Label>("ap-username").text = a?.username ?? "—";
            _root.Q<Label>("ap-email").text = a?.email ?? "—";
            _root.Q<Label>("ap-phone").text = a?.phone ?? "—";
            _root.Q<Label>("ap-2fa").text = (a != null && a.twofaEnabled) ? "On" : "Off";
        }

        private void OnLogout() => _auth.Logout(() => GameContext.Current.LoadMenu());

        private readonly HashSet<string> _openPanels = new HashSet<string>();

        private void ShowPanel(string name, bool show)
        {
            var p = _root.Q<VisualElement>(name);
            if (p == null) return;
            if (show) p.RemoveFromClassList("hidden"); else p.AddToClassList("hidden");

            // A panel you cannot click is not a panel. While the world has the
            // pointer captured for looking around there is no cursor to press a
            // button with, so an open panel asks for it back. See PointerFocus:
            // nothing sets the cursor itself, or they take turns and fight.
            if (show) _openPanels.Add(name); else _openPanels.Remove(name);
            if (_openPanels.Count > 0) TrapMadeIt.PointerFocus.Request("hud");
            else TrapMadeIt.PointerFocus.Release("hud");

            // And hold the world still while a panel is up. Reading your own
            // case file in the middle of the street, while Lincoln carries on
            // around you, is how you get run over by something you cannot see —
            // the same reasoning the full map already uses. GameFreeze rather
            // than writing Time.timeScale here, so closing the map does not
            // un-pause a panel that is still open.
            if (_openPanels.Count > 0) TrapMadeIt.GameFreeze.Request("hud");
            else TrapMadeIt.GameFreeze.Release("hud");
        }

        /// <summary>
        /// Keyboard shortcuts for the panels.
        ///
        /// Opening your own case file should not require finding a small button
        /// with a cursor you had to release first. **C** toggles it, and the
        /// same key closes it — so it works the way a phone's tap will, and the
        /// way a gamepad button will when the console requirement arrives.
        ///
        /// Escape closes whatever is open before it does anything else, which
        /// is what everyone expects it to do.
        /// </summary>
        private void Update()
        {
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k == null) return;

            // The Phone gets first refusal, and says whether it took the key.
            // Escape is wanted by the Phone, the panels and the map, and must
            // reach exactly one of them.
            if (_phone != null && _phone.HandleKeys()) return;

            if (k.cKey.wasPressedThisFrame) TogglePanel("panel-casefile");

            // Only when something is actually open — otherwise this would eat
            // the Escape that TrapMinimap uses to free the cursor.
            if (k.escapeKey.wasPressedThisFrame && _openPanels.Count > 0) CloseAllPanels();
#endif
        }

        /// <summary>Open it if shut, shut it if open.</summary>
        private void TogglePanel(string name)
        {
            bool open = _openPanels.Contains(name);
            if (!open) { CloseAllPanels(); _phone?.Close(); }   // never two surfaces stacked
            ShowPanel(name, !open);
            if (!open && name == "panel-casefile") _caseFile.Show(_level, LastLevel);
        }

        private void CloseAllPanels()
        {
            // ToArray: ShowPanel mutates _openPanels as it goes.
            foreach (var name in new List<string>(_openPanels)) ShowPanel(name, false);
        }

        private void OnDisable()
        {
            // Leaving the scene with a panel open would otherwise hold the
            // pointer for ever, in a scene where nothing is left to release it
            // — and hold the game frozen, in a scene with nothing left to
            // un-freeze it, which is worse.
            _openPanels.Clear();
            TrapMadeIt.PointerFocus.Release("hud");
            TrapMadeIt.GameFreeze.Release("hud");
            _phone?.Teardown();   // its holders are separate, so it releases its own
        }

        private void Msg(string name, string text, string kind)
        {
            var el = _root.Q<Label>(name);
            if (el == null) return;
            el.text = text;
            el.RemoveFromClassList("ok"); el.RemoveFromClassList("err");
            if (!string.IsNullOrEmpty(kind)) el.AddToClassList(kind);
        }
    }
}
