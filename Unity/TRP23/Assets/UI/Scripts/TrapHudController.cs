using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace TrapMadeIt.UI
{
    [RequireComponent(typeof(UIDocument))]
    public class TrapHudController : MonoBehaviour
    {
        private VisualElement _root;
        private IAuthService _auth;

        // Self-contained mock economy (the real ledger lives on the web backend).
        private int _cash = 1600;
        private int _bank = 0;
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
            _auth = SceneFlow.Ensure().Auth;

            _root.Q<Button>("open-store").clicked += () => ShowPanel("panel-store", true);
            _root.Q<Button>("open-bank").clicked += () => { RefreshBank(); ShowPanel("panel-bank", true); };
            _root.Q<Button>("open-account").clicked += () => { RefreshAccount(); ShowPanel("panel-account", true); };

            _root.Q<Button>("store-close").clicked += () => ShowPanel("panel-store", false);
            _root.Q<Button>("bank-close").clicked += () => ShowPanel("panel-bank", false);
            _root.Q<Button>("account-close").clicked += () => ShowPanel("panel-account", false);

            _root.Q<Button>("bank-deposit").clicked += () => Move(true);
            _root.Q<Button>("bank-withdraw").clicked += () => Move(false);
            _root.Q<Button>("account-logout").clicked += OnLogout;

            BuildStore();
            RefreshCoins();
            RefreshChip();
        }

        private void RefreshCoins() => _root.Q<Label>("coin-amt").text = _cash.ToString("N0");

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

        private void Buy(Drop d, Button buy)
        {
            if (_owned.Contains(d.id) || _cash < d.price) return;
            _cash -= d.price; _owned.Add(d.id);
            buy.text = "✓ IN CLOSET"; buy.SetEnabled(false);
            RefreshCoins();
        }

        private void RefreshBank()
        {
            _root.Q<Label>("bank-cash").text = _cash.ToString("N0");
            _root.Q<Label>("bank-saved").text = _bank.ToString("N0");
            Msg("bank-msg", "", null);
        }

        private void Move(bool deposit)
        {
            int amt;
            if (!int.TryParse(_root.Q<TextField>("bank-amount").value.Trim(), out amt) || amt <= 0)
            { Msg("bank-msg", "Enter a valid amount.", "err"); return; }
            if (deposit) { if (amt > _cash) { Msg("bank-msg", "Not enough cash.", "err"); return; } _cash -= amt; _bank += amt; Msg("bank-msg", "Deposited " + amt.ToString("N0") + ".", "ok"); }
            else { if (amt > _bank) { Msg("bank-msg", "Not enough in the bank.", "err"); return; } _bank -= amt; _cash += amt; Msg("bank-msg", "Withdrew " + amt.ToString("N0") + ".", "ok"); }
            RefreshBank(); RefreshCoins();
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

        private void OnLogout() => _auth.Logout(() => SceneFlow.Ensure().LoadMenu());

        private void ShowPanel(string name, bool show)
        {
            var p = _root.Q<VisualElement>(name);
            if (p == null) return;
            if (show) p.RemoveFromClassList("hidden"); else p.AddToClassList("hidden");
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
