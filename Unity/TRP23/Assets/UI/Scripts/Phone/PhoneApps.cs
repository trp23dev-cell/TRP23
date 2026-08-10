using System;
using UnityEngine.UIElements;

namespace TrapMadeIt.UI.Phone
{
    /// <summary>
    /// Shared furniture so six apps do not each reinvent a heading and a row.
    /// Presentation only — no app logic lives here.
    /// </summary>
    static class PhoneUI
    {
        public static VisualElement Surface()
        {
            var v = new VisualElement();
            v.AddToClassList("ph-surface");
            return v;
        }

        public static Label Line(string text, string cls = "ph-line")
        {
            var l = new Label(text);
            l.AddToClassList(cls);
            return l;
        }

        /// <summary>A label/value row, the shape most of the Phone is made of.</summary>
        public static VisualElement Row(string key, Label value)
        {
            var r = new VisualElement();
            r.AddToClassList("ph-row");
            r.Add(Line(key, "ph-k"));
            value.AddToClassList("ph-v");
            r.Add(value);
            return r;
        }

        /// <summary>
        /// What an app looks like before its package is written.
        ///
        /// Not "coming soon" — it names the package that will fill it in, so
        /// the shell is honest about being a shell rather than pretending to be
        /// broken.
        /// </summary>
        public static VisualElement Pending(string what, string package)
        {
            var v = Surface();
            v.Add(Line(what, "ph-pending-title"));
            v.Add(Line($"Arrives with {package}.", "ph-pending-body"));
            return v;
        }
    }

    /// <summary>
    /// Map.
    ///
    /// INTEGRATION CHOICE: LINK, NOT HOST.
    ///
    /// A working full map already exists in TrapMinimap, in TRP23.World, which
    /// TRP23.UI is not allowed to reference. Rebuilding it inside the Phone
    /// would be a second map to keep in step with the first, over an assembly
    /// boundary drawn specifically to stop that. So the app raises
    /// GameSignals.RequestOpenMap and the Phone shuts itself — the map takes
    /// the screen, as it does from M today.
    ///
    /// Whether the map should eventually live *inside* the phone frame is a
    /// U13 question with a real cost attached, and it is not being settled here
    /// by accident.
    /// </summary>
    sealed class MapApp : IPhoneApp
    {
        readonly Action openMap;
        public MapApp(Action open) { openMap = open; }

        public string Id => "map";
        public string Title => "MAP";
        public string Glyph => "◎";

        public VisualElement Build()
        {
            var v = PhoneUI.Surface();
            v.Add(PhoneUI.Line("Lincoln", "ph-pending-title"));
            v.Add(PhoneUI.Line("Opens the full map. Route planning and saved destinations arrive with U13.", "ph-pending-body"));
            var b = new Button(() => openMap?.Invoke()) { text = "OPEN MAP" };
            b.AddToClassList("ph-action");
            v.Add(b);
            return v;
        }

        public void OnShow() { }
    }

    /// <summary>
    /// Missions / Case File.
    ///
    /// INTEGRATION CHOICE: LINK, NOT DUPLICATE.
    ///
    /// TrapCardController already owns the case file, including the Chapter 01
    /// statement and the final-chapter question, and it is the same state the
    /// server validates. Two entry points to one implementation is fine; two
    /// implementations of one card is how the JS and C# trap-card logic drifted
    /// apart in the first place.
    ///
    /// The Phone closes as it hands over, so the two are never stacked.
    /// </summary>
    sealed class MissionsApp : IPhoneApp
    {
        readonly Action openCaseFile;
        public MissionsApp(Action open) { openCaseFile = open; }

        public string Id => "missions";
        public string Title => "CASE FILE";
        public string Glyph => "▤";

        public VisualElement Build()
        {
            var v = PhoneUI.Surface();
            v.Add(PhoneUI.Line("Your case file", "ph-pending-title"));
            v.Add(PhoneUI.Line("What you wrote, and what you owe. Mission tracking moves in here with U14.", "ph-pending-body"));
            var b = new Button(() => openCaseFile?.Invoke()) { text = "OPEN CASE FILE" };
            b.AddToClassList("ph-action");
            v.Add(b);
            return v;
        }

        public void OnShow() { }
    }

    /// <summary>
    /// Wallet.
    ///
    /// INTEGRATION CHOICE: SHOW, NEVER TRANSACT.
    ///
    /// The Phone tells you; the world is where you do it. It displays the
    /// balances the HUD last had back from the server and offers no deposit,
    /// no withdrawal and no purchase. That is the frozen doctrine, and it is
    /// also the safe implementation: this app holds no money logic to get
    /// wrong, and the ledger stays server-authoritative with one client path.
    ///
    /// It never computes a balance. The numbers are whatever the server last
    /// said, or a dash.
    /// </summary>
    sealed class WalletApp : IPhoneApp
    {
        Label cash, bank;
        int cashValue, bankValue;
        bool have;

        public string Id => "wallet";
        public string Title => "WALLET";
        public string Glyph => "◈";

        /// <summary>Pushed in by the Phone when the HUD hears from the server.</summary>
        public void SetBalances(int c, int b, bool known)
        {
            cashValue = c; bankValue = b; have = known;
            OnShow();
        }

        public VisualElement Build()
        {
            var v = PhoneUI.Surface();
            cash = new Label("—");
            bank = new Label("—");
            v.Add(PhoneUI.Row("ON YOU", cash));
            v.Add(PhoneUI.Row("TRP CENTRAL BANK", bank));
            v.Add(PhoneUI.Line("Banking is done at the bank. This is the balance, not the counter.", "ph-note"));
            OnShow();
            return v;
        }

        public void OnShow()
        {
            if (cash == null) return;
            cash.text = have ? $"{cashValue:N0} TC" : "—";
            bank.text = have ? $"{bankValue:N0} TC" : "—";
        }
    }

    /// <summary>
    /// The three apps whose systems do not exist yet.
    ///
    /// One class rather than three near-identical ones. They become their own
    /// files the moment any of them has behaviour — which is the point at which
    /// the split starts paying for itself, and not before.
    /// </summary>
    sealed class PendingApp : IPhoneApp
    {
        readonly string what, package;

        public PendingApp(string id, string title, string glyph, string what, string package)
        {
            Id = id; Title = title; Glyph = glyph;
            this.what = what; this.package = package;
        }

        public string Id { get; }
        public string Title { get; }
        public string Glyph { get; }

        public VisualElement Build() => PhoneUI.Pending(what, package);
        public void OnShow() { }
    }
}
