using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.World
{
    /// <summary>
    /// Scroll to pull the camera off the character's shoulder, and back into
    /// their head.
    ///
    /// Put this on the camera, parented to the character's camera root. The
    /// controller aims that root; this only decides how far behind it to sit,
    /// so the two never argue about where the camera is looking.
    ///
    /// Two things it has to get right or it is worse than not having it:
    ///
    ///   IT MUST NOT PUT THE CAMERA THROUGH A WALL. Lincoln's streets are
    ///   narrow and the medieval lanes uphill are narrower; a fixed boom would
    ///   spend half its time inside the building behind you, showing the inside
    ///   of a shop. So the boom is a spherecast, and it stops at whatever it
    ///   hits.
    ///
    ///   IT MUST HIDE THE CHARACTER IN FIRST PERSON. At zero distance the
    ///   camera sits inside their head, and without this you look out through
    ///   the back of your own skull.
    /// </summary>
    public class CameraBoom : MonoBehaviour
    {
        [Tooltip("Closest the camera comes. Zero is first person.")]
        public float minDistance = 0f;

        [Tooltip("Furthest back. Past about six metres a person stops being the "
               + "subject of the shot and the street does.")]
        public float maxDistance = 6f;

        [Tooltip("Metres per notch of the wheel.")]
        public float step = 0.6f;

        [Tooltip("How quickly it settles. Snapping straight to the new distance "
               + "reads as a jolt rather than a zoom.")]
        public float smoothing = 12f;

        [Tooltip("Keeps the camera off walls it would otherwise clip into.")]
        public float clearance = 0.28f;

        [Tooltip("What the boom collides with. The player's own layer must not "
               + "be in here, or the character blocks their own camera.")]
        public LayerMask blockers = ~0;

        [Tooltip("Layer the character is on, hidden when you are inside their head.")]
        public string playerLayer = "Player";

        /// Zero means first person.
        public float Distance { get; private set; }

        float wanted;
        float current;
        Camera cam;
        int playerMask;

        void Start()
        {
            cam = GetComponent<Camera>();
            playerMask = LayerMask.NameToLayer(playerLayer);

            // The player's own body must not block the boom, or the camera
            // never leaves their shoulder.
            if (playerMask >= 0) blockers &= ~(1 << playerMask);

            wanted = current = minDistance;
            Apply(0f);
        }

        void LateUpdate()
        {
            ReadWheel();

            // Unscaled, so the camera still settles while the map has the game
            // paused rather than freezing halfway through a zoom.
            float t = 1f - Mathf.Exp(-smoothing * Time.unscaledDeltaTime);
            current = Mathf.Lerp(current, wanted, t);
            Apply(current);
        }

        void ReadWheel()
        {
#if ENABLE_INPUT_SYSTEM
            var mouse = Mouse.current;
            if (mouse == null) return;

            // Anything holding the pointer takes the wheel with it — the map
            // while it is open, and any HUD panel. They are showing you
            // something; zooming the camera behind them is invisible at best
            // and is the view moving under you at worst.
            // PointerFocus covers the map now that it holds one while open, so
            // the FindAnyObjectByType<TrapMinimap>() that used to sit here has
            // gone — it was asking a second question with the same answer, once
            // per frame, by searching the scene for it.
            if (PointerFocus.Wanted) return;

            float wheel = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(wheel) < 0.01f) return;

            wanted = Mathf.Clamp(wanted - Mathf.Sign(wheel) * step, minDistance, maxDistance);
#endif
        }

        void Apply(float distance)
        {
            var pivot = transform.parent;
            if (pivot == null) return;

            float allowed = distance;
            if (distance > 0.01f)
            {
                // Straight back from the head. A sphere rather than a ray so the
                // camera stops before its near plane is already through the wall.
                if (Physics.SphereCast(pivot.position, clearance, -pivot.forward,
                        out RaycastHit hit, distance, blockers, QueryTriggerInteraction.Ignore))
                {
                    allowed = Mathf.Max(0f, hit.distance - 0.05f);
                }
            }

            transform.localPosition = new Vector3(0f, 0f, -allowed);
            transform.localRotation = Quaternion.identity;
            Distance = allowed;

            // Inside their head: stop drawing them. Note this uses the WANTED
            // distance, not the allowed one -- a camera shoved forward by a wall
            // behind you should not make your own body vanish.
            if (cam != null && playerMask >= 0)
            {
                bool firstPerson = distance < 0.35f;
                cam.cullingMask = firstPerson
                    ? cam.cullingMask & ~(1 << playerMask)
                    : cam.cullingMask | (1 << playerMask);
            }
        }
    }
}
