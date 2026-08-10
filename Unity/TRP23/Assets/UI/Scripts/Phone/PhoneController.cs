using System;
using System.Collections.Generic;
using UnityEngine.UIElements;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.UI.Phone
{
    /// <summary>
    /// The Phone: information, communication, navigation.
    ///
    /// WHAT IT IS NOT
    ///
    /// It is not a second way to play the game. The doctrine is fixed — the
    /// Phone tells you, the world is where you do it — so this class shows
    /// balances but never moves money, shows where the map is but does not draw
    /// one, and shows the case file exists but does not own it. Every time an
    /// app here could either *do* a thing or *point at* the thing, it points.
    ///
    /// WHY IT IS NOT A MONOBEHAVIOUR
    ///
    /// Same reason as TrapCardController: the HUD already owns the UIDocument
    /// and its lifetime, and a second component fighting it for the same root
    /// is how you get two things enabling and disabling in an order nobody
    /// chose. The HUD constructs this, drives its keys and tells it when it is
    /// going away.
    ///
    /// WHY IT HOLDS THE REGISTERS ITSELF
    ///
    /// PointerFocus and GameFreeze are named-holder sets, not counters, so the
    /// Phone taking "phone" while a panel holds "hud" and the map holds "map"
    /// composes correctly and releases correctly, in any order, including the
    /// order where the scene is torn down with all three open. That is the
    /// whole reason those are sets — this class is the third customer, and it
    /// adds no pause flag, no focus boolean and no cursor write of its own.
    /// </summary>
    public sealed class PhoneController
    {
        const string Holder = "phone";

        readonly VisualElement layer;      // the whole phone, hidden when shut
        readonly VisualElement home;       // the app grid
        readonly VisualElement stage;      // where an open app is mounted
        readonly Label title;              // app name, or the clock on home
        readonly Label clock;
        readonly Button back;

        readonly List<IPhoneApp> apps = new List<IPhoneApp>();
        readonly Dictionary<string, VisualElement> built = new Dictionary<string, VisualElement>();
        readonly WalletApp wallet = new WalletApp();

        IPhoneApp open;                    // null = home screen

        public bool IsOpen { get; private set; }

        /// <summary>Raised when the Phone wants everything else on screen shut.</summary>
        public event Action Opened;

        /// <param name="root">The HUD document root.</param>
        /// <param name="openCaseFile">Hands off to the existing case file panel.</param>
        public PhoneController(VisualElement root, Action openCaseFile)
        {
            layer = root.Q<VisualElement>("phone-layer");
            if (layer == null) return;           // no phone in this document; stay inert

            home = layer.Q<VisualElement>("phone-home");
            stage = layer.Q<VisualElement>("phone-stage");
            title = layer.Q<Label>("phone-title");
            clock = layer.Q<Label>("phone-clock");
            back = layer.Q<Button>("phone-back");

            // The six. Order is the home-screen order, and it is deliberate:
            // the three that do something today come first.
            apps.Add(new MapApp(TrapMadeIt.GameSignals.RequestOpenMap));
            apps.Add(new MissionsApp(() => openCaseFile?.Invoke()));
            apps.Add(wallet);
            apps.Add(new PendingApp("messages", "MESSAGES", "✉",
                "No messages", "the Messages package"));
            apps.Add(new PendingApp("drops", "DROPS", "◆",
                "No drops announced", "the Drops package"));
            apps.Add(new PendingApp("contacts", "CONTACTS", "☎",
                "No contacts yet", "the Contacts package"));

            BuildHome();

            // One primary surface among three. Its own home/app navigation is
            // nested inside this claim and never touches the coordinator.
            TrapMadeIt.ModalSurface.Register(Holder, Close);

            if (back != null) back.clicked += GoBack;
            var shut = layer.Q<Button>("phone-close");
            if (shut != null) shut.clicked += Close;

            Apply();
        }

        void BuildHome()
        {
            if (home == null) return;
            home.Clear();
            foreach (var app in apps)
            {
                var a = app;                       // captured per iteration, not per loop
                var tile = new Button(() => OpenApp(a));
                tile.AddToClassList("ph-tile");
                var g = new Label(a.Glyph); g.AddToClassList("ph-tile-glyph");
                var t = new Label(a.Title); t.AddToClassList("ph-tile-label");
                tile.Add(g);
                tile.Add(t);
                home.Add(tile);
            }
        }

        void OpenApp(IPhoneApp app)
        {
            if (stage == null) return;

            // Built once, kept. Rebuilding on every open would throw away any
            // state an app grows later and is wasted work on a phone.
            if (!built.TryGetValue(app.Id, out var view))
            {
                view = app.Build();
                built[app.Id] = view;
            }

            stage.Clear();
            stage.Add(view);
            open = app;
            app.OnShow();
            Apply();
        }

        /// <summary>
        /// Back. One level only: app → home. There is no deeper stack yet, and
        /// inventing one before an app has sub-screens would be guessing at the
        /// shape of navigation that U13 and Messages will actually need.
        /// </summary>
        public void GoBack()
        {
            if (open == null) { Close(); return; }
            open = null;
            stage?.Clear();
            Apply();
        }

        public void Toggle()
        {
            if (IsOpen) Close(); else Show();
        }

        public void Show()
        {
            if (layer == null || IsOpen) return;
            IsOpen = true;

            // You need a cursor to press an app, and the street should not carry
            // on while you are reading. Same two registers every other surface
            // uses; no third mechanism.
            TrapMadeIt.PointerFocus.Request(Holder);
            TrapMadeIt.GameFreeze.Request(Holder);
            TrapMadeIt.ModalSurface.Claim(Holder);   // shuts the map or a panel if either had the screen

            open = null;                    // always opens on the home screen
            stage?.Clear();
            Apply();
            Opened?.Invoke();
        }

        public void Close()
        {
            if (layer == null || !IsOpen) return;
            IsOpen = false;
            open = null;
            stage?.Clear();
            TrapMadeIt.PointerFocus.Release(Holder);
            TrapMadeIt.GameFreeze.Release(Holder);
            TrapMadeIt.ModalSurface.Yield(Holder);
            Apply();
        }

        /// <summary>
        /// Give up both registers unconditionally. The HUD calls this on
        /// disable: a scene that changes with the Phone open would otherwise
        /// leave the game frozen and the cursor held by a holder that no longer
        /// exists to release them.
        /// </summary>
        public void Teardown()
        {
            IsOpen = false;
            open = null;
            TrapMadeIt.PointerFocus.Release(Holder);
            TrapMadeIt.GameFreeze.Release(Holder);
            TrapMadeIt.ModalSurface.Unregister(Holder);
            Apply();
        }

        /// <summary>Balances as last reported by the server. Never computed here.</summary>
        public void SetBalances(int cash, int bank, bool known) => wallet.SetBalances(cash, bank, known);

        /// <summary>
        /// Keys, driven by the HUD's Update so there is one keyboard reader.
        /// Returns true if the Phone consumed the key — Escape in particular,
        /// which everything on screen wants and which must reach exactly one of
        /// them.
        /// </summary>
        public bool HandleKeys()
        {
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k == null) return false;

            if (k.pKey.wasPressedThisFrame) { Toggle(); return true; }

            if (IsOpen && k.escapeKey.wasPressedThisFrame) { GoBack(); return true; }
#endif
            return false;
        }

        void Apply()
        {
            if (layer == null) return;

            if (IsOpen) layer.RemoveFromClassList("hidden");
            else layer.AddToClassList("hidden");

            bool onHome = open == null;
            if (home != null) home.style.display = onHome ? DisplayStyle.Flex : DisplayStyle.None;
            if (stage != null) stage.style.display = onHome ? DisplayStyle.None : DisplayStyle.Flex;

            if (title != null) title.text = onHome ? "TRAPFONE" : open.Title;

            // Back always reads as a way out: it leaves the app on an app, and
            // shuts the Phone on the home screen. A button that sometimes does
            // nothing is worse than one that always does something.
            if (back != null) back.text = onHome ? "CLOSE" : "BACK";

            // Placeholder clock. Server-authoritative world time is D-W02 and
            // arrives with its own package — showing a real device clock here
            // would quietly contradict a frozen decision.
            if (clock != null) clock.text = "--:--";
        }
    }
}
