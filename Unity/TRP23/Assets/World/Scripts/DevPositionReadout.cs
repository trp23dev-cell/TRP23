#if UNITY_EDITOR || DEVELOPMENT_BUILD
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.World
{
    /// <summary>
    /// Where you are standing, for whoever is testing. **F3** toggles it.
    ///
    /// WHY THE WHOLE FILE IS INSIDE AN #if
    ///
    /// Not the draw call, not the component — the file. A production build
    /// contains no readout, no toggle, no key handler and no class, so there is
    /// nothing to accidentally ship, nothing to strip later and nothing to
    /// forget about. The one cost is that the symbol does not exist in a
    /// release build, so nothing may reference it; nothing does, and nothing
    /// should.
    ///
    /// WHY IT INSTALLS ITSELF
    ///
    /// RuntimeInitializeOnLoadMethod rather than a component in the scene. A
    /// debug overlay that lives in TrapGame.unity is a debug overlay that shows
    /// up in the scene diff of every unrelated commit, and that someone
    /// eventually deletes by accident. This way the scene files never mention
    /// it and it works in any scene, including one made tomorrow.
    ///
    /// WHY IMGUI
    ///
    /// The production HUD is UI Toolkit and this must not touch it. OnGUI needs
    /// no document, no UXML, no stylesheet and no place in the visual tree, so
    /// it cannot disturb the Phone, the panels or the map by construction — and
    /// it looks like what it is. It allocates a little per frame, which is the
    /// right trade for something that does not exist in a shipping build.
    ///
    /// WHAT IT DELIBERATELY DOES NOT DO
    ///
    /// It takes no PointerFocus, no GameFreeze and no ModalSurface. It is not a
    /// surface — it never wants the cursor, never pauses anything, and never
    /// closes anything. It reads the player's transform and nothing else: there
    /// is no second copy of the position here to drift out of step with the
    /// real one.
    ///
    /// **This is not the start of a debug menu.** If a second readout is
    /// wanted, that is its own decision.
    /// </summary>
    public class DevPositionReadout : MonoBehaviour
    {
        /// <summary>Default on: the point is to see it without turning it on.</summary>
        public static bool Visible = true;

        Transform target;
        GUIStyle style;
        readonly GUIContent content = new GUIContent();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
            var go = new GameObject("DevPositionReadout") { hideFlags = HideFlags.DontSave };
            go.AddComponent<DevPositionReadout>();
            DontDestroyOnLoad(go);
        }

        /// <summary>
        /// The player, or nothing.
        ///
        /// Re-resolved whenever it is missing, because this object outlives
        /// scene changes and the player does not. In the menu there is no
        /// player, so there is no readout — which is the correct behaviour and
        /// costs no special case.
        /// </summary>
        void Resolve()
        {
            if (target != null) return;

            var player = FindFirstObjectByType<TrapPlayerController>();
            if (player != null) { target = player.transform; return; }

            // A scene being flown rather than walked still wants coordinates.
            if (Camera.main != null) target = Camera.main.transform;
        }

        void Update()
        {
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            // F3, and only F3. No other key is read, so nothing here can eat an
            // input the Phone, the map or a panel was waiting for.
            if (k != null && k.f3Key.wasPressedThisFrame) Visible = !Visible;
#endif
            Resolve();
        }

        void OnGUI()
        {
            if (!Visible || target == null) return;

            if (style == null)
            {
                style = new GUIStyle(GUI.skin.label)
                {
                    fontSize = 12,
                    alignment = TextAnchor.MiddleLeft,
                    padding = new RectOffset(8, 8, 4, 4),
                };
                style.normal.textColor = new Color(0.79f, 0.63f, 0.42f);   // the project's gold, dimmed
            }

            var p = target.position;
            // One decimal. Ten centimetres is finer than anyone can stand, and
            // more digits make the number harder to read back to me.
            content.text = $"POS  X {p.x:F1}  |  Y {p.y:F1}  |  Z {p.z:F1}    [F3]";

            var size = style.CalcSize(content);
            // Bottom left, clear of the HUD's top bar, action buttons and
            // objective panel, and clear of the Phone, which sits on the right.
            var rect = new Rect(10f, Screen.height - size.y - 10f, size.x, size.y);

            var was = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.55f);
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = was;

            GUI.Label(rect, content, style);
        }
    }
}
#endif
