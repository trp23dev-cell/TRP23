using UnityEngine;
using UnityEngine.UIElements;

namespace TrapMadeIt.UI
{
    [RequireComponent(typeof(UIDocument))]
    public class TrapMenuController : MonoBehaviour
    {
        private VisualElement _root;
        private IAuthService _auth;

        private VisualElement _home, _authScreen, _twofa, _loading;

        private void OnEnable()
        {
            _root = GetComponent<UIDocument>().rootVisualElement;
            _auth = SceneFlow.Ensure().Auth;

            _home = _root.Q<VisualElement>("screen-home");
            _authScreen = _root.Q<VisualElement>("screen-auth");
            _twofa = _root.Q<VisualElement>("screen-2fa");
            _loading = _root.Q<VisualElement>("loading-overlay");

            // Home
            _root.Q<Button>("home-enter").clicked += OnHomeEnter;

            // Tabs
            _root.Q<Button>("tab-signup").clicked += () => SwitchTab(true);
            _root.Q<Button>("tab-login").clicked += () => SwitchTab(false);

            // Forms
            _root.Q<Button>("su-submit").clicked += OnSignup;
            _root.Q<Button>("li-submit").clicked += OnLogin;
            _root.Q<Button>("guest-btn").clicked += OnGuest;
            _root.Q<Button>("auth-back").clicked += () => Show(_home);

            // 2FA
            _root.Q<Button>("twofa-confirm").clicked += OnTwoFactorConfirm;
            _root.Q<Button>("twofa-skip").clicked += StartGame;

            Show(_home);
        }

        private void OnHomeEnter()
        {
            var a = _auth.Current;
            if (a != null && !a.isGuest && !string.IsNullOrEmpty(a.username)) StartGame();
            else Show(_authScreen);
        }

        private void SwitchTab(bool signup)
        {
            _root.Q<Button>("tab-signup").EnableInClassList("active", signup);
            _root.Q<Button>("tab-login").EnableInClassList("active", !signup);
            _root.Q<VisualElement>("form-signup").style.display = signup ? DisplayStyle.Flex : DisplayStyle.None;
            _root.Q<VisualElement>("form-login").style.display = signup ? DisplayStyle.None : DisplayStyle.Flex;
            Msg("auth-msg", "", null);
        }

        private void OnSignup()
        {
            var req = new SignupRequest {
                username = _root.Q<TextField>("su-username").value.Trim(),
                email = _root.Q<TextField>("su-email").value.Trim(),
                phone = _root.Q<TextField>("su-phone").value.Trim(),
                password = _root.Q<TextField>("su-password").value,
                enable2fa = _root.Q<Toggle>("su-2fa").value
            };
            Msg("auth-msg", "Creating account…", null);
            _auth.Register(req, res =>
            {
                if (!res.ok) { Msg("auth-msg", res.error, "err"); return; }
                if (res.twofa != null && !string.IsNullOrEmpty(res.twofa.secret))
                {
                    _root.Q<Label>("twofa-secret").text = res.twofa.secret;
                    Show(_twofa);
                }
                else StartGame();
            });
        }

        private void OnLogin()
        {
            var id = _root.Q<TextField>("li-identifier").value.Trim();
            var pw = _root.Q<TextField>("li-password").value;
            var code = _root.Q<TextField>("li-code").value.Trim();
            Msg("auth-msg", "Logging in…", null);
            _auth.Login(id, pw, code, res =>
            {
                if (res.ok) { StartGame(); }
                else if (res.twofaRequired)
                {
                    _root.Q<VisualElement>("li-code-row").style.display = DisplayStyle.Flex;
                    Msg("auth-msg", "Enter your 6-digit authenticator code.", null);
                }
                else Msg("auth-msg", res.error, "err");
            });
        }

        private void OnGuest()
        {
            Msg("auth-msg", "Starting guest session…", null);
            _auth.StartGuest(res => { if (res.ok) StartGame(); else Msg("auth-msg", "Could not start guest session.", "err"); });
        }

        private void OnTwoFactorConfirm()
        {
            var code = _root.Q<TextField>("twofa-code").value.Trim();
            if (string.IsNullOrEmpty(code)) { Msg("twofa-msg", "Enter the 6-digit code.", "err"); return; }
            _auth.EnableTwoFactor(code, res => { if (res.ok) StartGame(); else Msg("twofa-msg", res.error, "err"); });
        }

        private void StartGame()
        {
            _loading.RemoveFromClassList("hidden");
            Invoke(nameof(GoToGame), 0.9f);
        }
        private void GoToGame() => SceneFlow.Ensure().LoadGame();

        private void Show(VisualElement screen)
        {
            _home.style.display = screen == _home ? DisplayStyle.Flex : DisplayStyle.None;
            _authScreen.style.display = screen == _authScreen ? DisplayStyle.Flex : DisplayStyle.None;
            _twofa.style.display = screen == _twofa ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void Msg(string name, string text, string kind)
        {
            var el = _root.Q<Label>(name);
            if (el == null) return;
            el.text = text;
            el.RemoveFromClassList("ok");
            el.RemoveFromClassList("err");
            if (!string.IsNullOrEmpty(kind)) el.AddToClassList(kind);
        }
    }
}
