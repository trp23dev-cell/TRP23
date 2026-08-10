using UnityEngine;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.World
{
    /// <summary>
    /// The street map, as a game map rather than a diagram.
    ///
    /// The web client rasterises this by hand -- roads, then footprints, then
    /// markers, drawn into a 2D canvas. That was the right answer there because
    /// the browser had the polygons and no cheap way to render the city twice.
    /// Here it is the wrong answer: the city is already built as meshes, so a
    /// second orthographic camera looking straight down IS the map, in colour,
    /// with every kerb and roof in the right place, for a few lines of code and
    /// one extra render of geometry that is already in memory.
    ///
    /// North is up and stays up. A rotating map is easier to follow for the next
    /// thirty seconds and impossible to build a mental picture of a city from,
    /// and Lincoln is a place people know the shape of.
    ///
    /// Attribution is not decoration. The map data is OpenStreetMap under ODbL,
    /// which requires the credit to be shown wherever the map is -- so the label
    /// is built here, next to the map, rather than left to a credits screen
    /// somebody might later delete.
    /// </summary>
    public class TrapMinimap : MonoBehaviour
    {
        [Tooltip("Leave empty to use the streamer's follow target.")]
        public Transform player;
        public WorldStreamer world;

        [Tooltip("Half-height of the view, in metres. Index into this with the zoom keys.")]
        public float[] zoomMetres = { 25f, 50f, 100f, 200f, 400f };
        public int zoomIndex = 2;

        [Tooltip("Half-height shown when the full map is open.")]
        public float bigMapMetres = 900f;

        [Tooltip("Pixel size of the map render. 512 is plenty for a corner dial " +
                 "and still sharp full-screen.")]
        public int textureSize = 512;

        [Tooltip("Layer the player is on, excluded from the map so the character " +
                 "does not sit on top of it as a blob. Ignored if it does not exist.")]
        public string playerLayer = "Player";

        public bool BigMap { get; private set; }
        public Vector3? Waypoint { get; private set; }

        // Escape lets go of the mouse; clicking in the window takes it back.
        // Without this the editor traps you, and in a build there is no way out
        // of the window at all.
        bool cursorReleased;

        Camera mapCamera;
        RenderTexture target;
        RawImage image;
        RectTransform imageRect;
        RectTransform playerPin;
        RectTransform waypointPin;
        Text readout;
        LineRenderer guide;

        const float SmallSize = 240f;
        const float Margin = 18f;

        void Start()
        {
            if (world == null) world = FindAnyObjectByType<WorldStreamer>();
            if (player == null && world != null) player = world.follow;
            if (player == null)
            {
                Debug.LogError("[map] nothing to follow — the map will not track anyone.");
                enabled = false;
                return;
            }

            BuildCamera();
            BuildCanvas();
            BuildGuide();
            Apply();
        }

        void BuildCamera()
        {
            var go = new GameObject("MinimapCamera");
            go.transform.SetParent(transform, false);
            mapCamera = go.AddComponent<Camera>();
            mapCamera.orthographic = true;
            mapCamera.clearFlags = CameraClearFlags.SolidColor;
            mapCamera.backgroundColor = new Color(0.06f, 0.06f, 0.07f);
            // Straight down, and never rotated with the player. See the note
            // above about north staying up.
            mapCamera.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            // Deep enough to see the bottom of the valley from above the
            // Cathedral: 80m of hill plus its 83m spire, with room to spare.
            mapCamera.nearClipPlane = 1f;
            mapCamera.farClipPlane = 1200f;
            mapCamera.depth = -10;          // renders before the main camera

            int layer = LayerMask.NameToLayer(playerLayer);
            if (layer >= 0) mapCamera.cullingMask = ~(1 << layer);

            target = new RenderTexture(textureSize, textureSize, 16)
            {
                name = "TrapMinimap",
                filterMode = FilterMode.Bilinear,
            };
            mapCamera.targetTexture = target;
        }

        void BuildCanvas()
        {
            var canvasGo = new GameObject("MapCanvas");
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);

            var imageGo = new GameObject("Map");
            imageGo.transform.SetParent(canvasGo.transform, false);
            image = imageGo.AddComponent<RawImage>();
            image.texture = target;
            imageRect = imageGo.GetComponent<RectTransform>();

            // Anchored bottom-right for the dial; re-anchored when the full map
            // opens. Pivot at the corner keeps the maths the same either way.
            imageRect.anchorMin = imageRect.anchorMax = new Vector2(1f, 0f);
            imageRect.pivot = new Vector2(1f, 0f);

            playerPin = MakePin(imageGo.transform, new Color(0.96f, 0.93f, 0.87f), 14f, "PlayerPin");
            waypointPin = MakePin(imageGo.transform, new Color(0.91f, 0.79f, 0.54f), 16f, "WaypointPin");
            waypointPin.gameObject.SetActive(false);

            readout = MakeLabel(canvasGo.transform);
        }

        static RectTransform MakePin(Transform parent, Color colour, float size, string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var img = go.AddComponent<Image>();
            img.color = colour;
            var rt = go.GetComponent<RectTransform>();
            rt.sizeDelta = new Vector2(size, size);
            // Centre-anchored, so a position is simply an offset in pixels from
            // the middle of the map -- which is where the player always is.
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            return rt;
        }

        Text MakeLabel(Transform parent)
        {
            var go = new GameObject("Attribution");
            go.transform.SetParent(parent, false);
            var text = go.AddComponent<Text>();
            // The only font guaranteed to exist without importing one.
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            text.fontSize = 12;
            text.alignment = TextAnchor.LowerRight;
            text.color = new Color(0.78f, 0.74f, 0.68f, 0.85f);
            var rt = go.GetComponent<RectTransform>();
            rt.anchorMin = rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(1f, 0f);
            rt.sizeDelta = new Vector2(420f, 34f);
            rt.anchoredPosition = new Vector2(-Margin, Margin * 0.25f);
            return text;
        }

        void BuildGuide()
        {
            // A line on the ground from the player to the waypoint. The map
            // tells you where it is; this tells you which way to walk without
            // looking away from the street, which is the whole point of it.
            var go = new GameObject("WaypointGuide");
            go.transform.SetParent(transform, false);
            guide = go.AddComponent<LineRenderer>();
            guide.positionCount = 0;
            guide.startWidth = guide.endWidth = 0.5f;
            guide.useWorldSpace = true;
            guide.numCapVertices = 2;

            // Borrow a loaded shader rather than looking one up by name. Same
            // reasoning as the streamer: Shader.Find returns null for URP
            // shaders at runtime, and a null shader is the magenta.
            Shader known = world != null && world.groundMaterial != null
                ? world.groundMaterial.shader
                : Shader.Find("Sprites/Default");
            if (known != null)
            {
                var mat = new Material(known) { name = "TrapGuide" };
                var amber = new Color(0.91f, 0.79f, 0.54f);
                if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", amber);
                else mat.color = amber;
                guide.material = mat;
            }
        }

        void Update()
        {
            if (player == null) return;

            ReadInput();

            // Follow in plan only. Height is fixed well above the Cathedral so
            // the map does not dive into a building when the player walks
            // downhill, and does not clip the spire when they walk up it.
            var p = player.position;
            mapCamera.transform.position = new Vector3(p.x, 400f, p.z);

            UpdatePins();
            UpdateGuide();
            ApplyCursor();
            // Every frame, not only when M is pressed: a HUD panel can ask for
            // the world to be held still at any moment, and it has no other way
            // to be heard.
            ApplyPause();
        }

        /// <summary>
        /// The full map stops the world.
        ///
        /// You read it to decide where to go, and standing in the street with
        /// your view filled by a map while the city carries on around you is
        /// how you get run over by something you cannot see. Time scale rather
        /// than disabling the controller: it stops everything at once, and
        /// nothing has to remember what it was doing.
        ///
        /// Input still works at zero time scale, so closing the map still works.
        /// </summary>
        /// <summary>
        /// Open or close the full map.
        ///
        /// The map ANNOUNCES itself to the two registers rather than being a
        /// special case in the code that reads them. It used to set BigMap and
        /// nothing else, and every consumer carried a `BigMap ||` term — which
        /// meant anything that asked "is gameplay input blocked?" got the wrong
        /// answer, because the map had never said it was blocking anything.
        ///
        /// That is exactly how mouse look kept working with the map open: the
        /// world stopped because timeScale was 0, not because the freeze was
        /// being honoured, and mouse look does not use deltaTime.
        /// </summary>
        void SetBigMap(bool open)
        {
            BigMap = open;
            if (open)
            {
                PointerFocus.Request("map");   // you need a cursor to set a waypoint
                GameFreeze.Request("map");     // and the city should not move while you read
            }
            else
            {
                PointerFocus.Release("map");
                GameFreeze.Release("map");
            }
            Apply();
            ApplyPause();
        }

        void ApplyPause()
        {
            // One authority. The map is a holder of GameFreeze now, like any
            // panel, so this no longer needs to know the map exists.
            Time.timeScale = GameFreeze.Wanted ? 0f : 1f;
        }

        void OnEnable()
        {
            // The Phone's Map app cannot call this directly -- TRP23.UI must not
            // reference TRP23.World (WP-U01) -- so it raises a signal and the
            // map, which owns opening itself, answers it. Paired with the
            // unsubscribe in OnDisable: a static event that outlives its scene
            // is a leak and a call into a destroyed object.
            GameSignals.OpenMapRequested += OnOpenMapRequested;
        }

        void OnOpenMapRequested()
        {
            if (!BigMap) SetBigMap(true);
        }

        void OnDisable()
        {
            GameSignals.OpenMapRequested -= OnOpenMapRequested;

            // Never leave the game paused or the cursor captured because a
            // scene changed with the map open -- there would be nothing left to
            // release either of them.
            PointerFocus.Release("map");
            GameFreeze.Release("map");
            Time.timeScale = GameFreeze.Wanted ? 0f : 1f;
        }

        /// <summary>
        /// One owner for the mouse pointer.
        ///
        /// Looking around needs it captured -- otherwise it runs into the edge
        /// of the screen and the camera stops turning, which is exactly what a
        /// free cursor feels like. The full map needs it back, because setting a
        /// waypoint means clicking on a place.
        ///
        /// Starter Assets also sets cursor state, but only when the window
        /// gains or loses focus, so it cannot be relied on to hold a decision
        /// made mid-game. Deciding here every frame -- and only writing when it
        /// actually differs -- means one thing is in charge and it is the thing
        /// that knows whether the map is open.
        /// </summary>
        void ApplyCursor()
        {
            // The map is not the only thing that can want the pointer -- the
            // HUD panels need it to be clickable at all -- so the answer comes
            // from PointerFocus rather than from what this script knows.
            // No BigMap term. The map holds PointerFocus while it is open, so it
            // is already covered by the general answer.
            bool wantFree = cursorReleased || PointerFocus.Wanted;
            var wantLock = wantFree ? CursorLockMode.None : CursorLockMode.Locked;

            if (Cursor.lockState != wantLock) Cursor.lockState = wantLock;
            if (Cursor.visible != wantFree) Cursor.visible = wantFree;
        }

        void ReadInput()
        {
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k != null)
            {
                if (k.mKey.wasPressedThisFrame) SetBigMap(!BigMap);
                if (k.leftBracketKey.wasPressedThisFrame) StepDial(-1);
                if (k.rightBracketKey.wasPressedThisFrame) StepDial(1);
                // A toggle, not a one-way switch. It used to only ever set this
                // true, and the way back was "click anywhere" — which is the
                // bug below.
                if (k.escapeKey.wasPressedThisFrame) cursorReleased = !cursorReleased;
            }

            var mouse = Mouse.current;
            if (mouse != null)
            {
                // The wheel belongs to the map ONLY while the map is open.
                // Out in the street it is the camera's, for pulling back off
                // the character's shoulder -- see CameraBoom. Two things
                // reading the same wheel is how one of them stops working.
                float wheel = mouse.scroll.ReadValue().y;
                if (BigMap && Mathf.Abs(wheel) > 0.01f) Zoom(wheel > 0f ? -1 : 1);

                if (mouse.leftButton.wasPressedThisFrame && BigMap)
                    SetWaypointFromScreen(mouse.position.ReadValue());

                // There used to be a "click anywhere to take the mouse back"
                // here, and it made the HUD nearly unclickable: the same click
                // that pressed CASE FILE also re-captured the cursor, so
                // whether the button registered was a race between the two. It
                // took three attempts to open a panel.
                //
                // Escape toggles now, so there is a deliberate way back and
                // nothing has to guess what a click meant.
                if (mouse.rightButton.wasPressedThisFrame && BigMap)
                    ClearWaypoint();
            }
#endif
        }

        void Zoom(int by)
        {
            if (!BigMap) return;
            {
                // The full map zooms smoothly rather than in fixed steps: it is
                // being read, not glanced at, and 900m is a starting point
                // rather than the only useful scale. Bounded so it cannot be
                // scrolled into either a single roof or the whole county.
                bigMapMetres = Mathf.Clamp(bigMapMetres * (by > 0 ? 1.2f : 1f / 1.2f), 120f, 2400f);
            }
            Apply();
        }

        /// The corner dial's fixed zoom steps, on the bracket keys.
        void StepDial(int by)
        {
            if (BigMap) return;
            zoomIndex = Mathf.Clamp(zoomIndex + by, 0, zoomMetres.Length - 1);
            Apply();
        }

        void Apply()
        {
            mapCamera.orthographicSize = BigMap ? bigMapMetres : zoomMetres[zoomIndex];

            if (BigMap)
            {
                // Square, and as large as the screen allows. A stretched map is
                // a map with the wrong distances on it.
                float side = Mathf.Min(Screen.width, Screen.height) * 0.86f;
                imageRect.anchorMin = imageRect.anchorMax = new Vector2(0.5f, 0.5f);
                imageRect.pivot = new Vector2(0.5f, 0.5f);
                imageRect.sizeDelta = new Vector2(side, side);
                imageRect.anchoredPosition = Vector2.zero;
            }
            else
            {
                imageRect.anchorMin = imageRect.anchorMax = new Vector2(1f, 0f);
                imageRect.pivot = new Vector2(1f, 0f);
                imageRect.sizeDelta = new Vector2(SmallSize, SmallSize);
                imageRect.anchoredPosition = new Vector2(-Margin, Margin);
            }

            readout.text = BigMap
                ? $"M close map    click set waypoint    right-click clear    scroll zoom ({mapCamera.orthographicSize:F0}m)\n" +
                  "© OpenStreetMap contributors"
                : $"M map    scroll or [ ] zoom ({mapCamera.orthographicSize:F0}m)    esc free mouse\n" +
                  "© OpenStreetMap contributors";
        }

        bool OverMap(Vector2 screen)
        {
            return RectTransformUtility.RectangleContainsScreenPoint(imageRect, screen, null);
        }

        /// <summary>
        /// Map click to world position. The camera is orthographic and looking
        /// straight down, so this is a straight linear mapping -- no raycast
        /// needed, and no dependence on anything being loaded where you clicked.
        /// </summary>
        void SetWaypointFromScreen(Vector2 screen)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    imageRect, screen, null, out Vector2 local)) return;

            var rect = imageRect.rect;
            if (!rect.Contains(local)) return;

            float nx = local.x / (rect.width * 0.5f);     // -1..1
            float ny = local.y / (rect.height * 0.5f);
            float half = mapCamera.orthographicSize;

            var at = mapCamera.transform.position;
            var target3 = new Vector3(at.x + nx * half, 0f, at.z + ny * half);
            if (world != null && world.TryGroundHeight(target3.x, target3.z, out float y)) target3.y = y;
            else target3.y = player.position.y;

            Waypoint = target3;
            waypointPin.gameObject.SetActive(true);
        }

        public void ClearWaypoint()
        {
            Waypoint = null;
            waypointPin.gameObject.SetActive(false);
            guide.positionCount = 0;
        }

        void UpdatePins()
        {
            // The player is always dead centre; the pin only has to say which
            // way they are facing.
            playerPin.anchoredPosition = Vector2.zero;
            playerPin.localRotation = Quaternion.Euler(0f, 0f, -player.eulerAngles.y);

            if (Waypoint == null) return;

            var w = Waypoint.Value;
            var at = mapCamera.transform.position;
            float half = mapCamera.orthographicSize;
            float side = imageRect.rect.width * 0.5f;

            float px = (w.x - at.x) / half * side;
            float py = (w.z - at.z) / half * side;

            // Off the edge: pin it to the rim rather than letting it disappear.
            // A marker you cannot see is no use, and the direction is the part
            // that matters once it is far away.
            float rim = side - 12f;
            var offset = new Vector2(px, py);
            if (offset.magnitude > rim) offset = offset.normalized * rim;
            waypointPin.anchoredPosition = offset;
        }

        void UpdateGuide()
        {
            if (Waypoint == null || guide == null) return;

            var from = player.position;
            var to = Waypoint.Value;

            // Follow the hill rather than cutting through it. A straight line
            // from A to B disappears underground the moment Lincoln does what
            // Lincoln does, which is go uphill.
            const int steps = 24;
            guide.positionCount = steps + 1;
            for (int i = 0; i <= steps; i++)
            {
                float t = i / (float)steps;
                float x = Mathf.Lerp(from.x, to.x, t);
                float z = Mathf.Lerp(from.z, to.z, t);
                float y = world != null && world.TryGroundHeight(x, z, out float g)
                    ? g
                    : Mathf.Lerp(from.y, to.y, t);
                guide.SetPosition(i, new Vector3(x, y + 0.15f, z));
            }
        }

        void OnDestroy()
        {
            if (target != null) target.Release();
        }
    }
}
