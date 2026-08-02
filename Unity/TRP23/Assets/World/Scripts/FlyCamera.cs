using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.World
{
    /// <summary>
    /// Moves the camera around the city, either walking the ground or flying.
    ///
    /// Double-tap space to switch. Walking is how the game is played and how
    /// the streets read; flying is how you check a city of three thousand
    /// buildings actually looks right, which you cannot do from eye level.
    ///
    /// This project runs the new Input System (activeInputHandler: 1), where
    /// the old UnityEngine.Input class throws on every call rather than
    /// returning nothing. Both paths are here because that setting is exactly
    /// the kind of thing that gets changed later.
    /// </summary>
    public class FlyCamera : MonoBehaviour
    {
        public float walkSpeed = 8f;
        public float flySpeed = 60f;
        public float sprintMultiplier = 4f;
        public float lookSensitivity = 0.12f;

        [Tooltip("How quickly a second tap of space counts as a double tap.")]
        public float doubleTapWindow = 0.35f;

        public bool Flying { get; private set; } = true;

        float yaw, pitch;
        float lastSpaceTap = -10f;

        void Start()
        {
            var e = transform.rotation.eulerAngles;
            yaw = e.y;
            pitch = e.x > 180f ? e.x - 360f : e.x;
        }

        void Update()
        {
            if (SpacePressedThisFrame())
            {
                if (Time.time - lastSpaceTap < doubleTapWindow)
                {
                    Flying = !Flying;
                    lastSpaceTap = -10f;   // so a third tap does not re-toggle
                    Debug.Log($"[camera] {(Flying ? "flying" : "walking")}");
                }
                else
                {
                    lastSpaceTap = Time.time;
                }
            }

            ReadLook(out float lookX, out float lookY, out bool looking);
            if (looking)
            {
                yaw += lookX * lookSensitivity;
                pitch = Mathf.Clamp(pitch - lookY * lookSensitivity, -89f, 89f);
                transform.rotation = Quaternion.Euler(pitch, yaw, 0f);
            }

            ReadMove(out Vector3 move, out bool sprint);
            if (move.sqrMagnitude < 0.0001f) return;

            float s = (Flying ? flySpeed : walkSpeed) * (sprint ? sprintMultiplier : 1f);
            var step = transform.TransformDirection(move.normalized) * s * Time.deltaTime;

            // Walking keeps you on the ground, so forward means forward along
            // the street rather than into the pavement when looking down.
            if (!Flying) step.y = 0f;
            transform.position += step;
        }

#if ENABLE_INPUT_SYSTEM
        static bool SpacePressedThisFrame()
        {
            var k = Keyboard.current;
            return k != null && k.spaceKey.wasPressedThisFrame;
        }

        void ReadLook(out float x, out float y, out bool looking)
        {
            x = y = 0f;
            looking = false;
            var mouse = Mouse.current;
            if (mouse == null || !mouse.rightButton.isPressed) return;
            var d = mouse.delta.ReadValue();
            x = d.x;
            y = d.y;
            looking = true;
        }

        void ReadMove(out Vector3 move, out bool sprint)
        {
            move = Vector3.zero;
            sprint = false;
            var k = Keyboard.current;
            if (k == null) return;

            float h = (k.dKey.isPressed ? 1f : 0f) - (k.aKey.isPressed ? 1f : 0f);
            float v = (k.wKey.isPressed ? 1f : 0f) - (k.sKey.isPressed ? 1f : 0f);
            // Q and E only lift you when flying; on foot the ground decides.
            float up = Flying
                ? (k.eKey.isPressed ? 1f : 0f) - (k.qKey.isPressed ? 1f : 0f)
                : 0f;
            move = new Vector3(h, up, v);
            sprint = k.leftShiftKey.isPressed;
        }
#else
        static bool SpacePressedThisFrame() => Input.GetKeyDown(KeyCode.Space);

        void ReadLook(out float x, out float y, out bool looking)
        {
            looking = Input.GetMouseButton(1);
            x = looking ? Input.GetAxis("Mouse X") * 20f : 0f;
            y = looking ? Input.GetAxis("Mouse Y") * 20f : 0f;
        }

        void ReadMove(out Vector3 move, out bool sprint)
        {
            move = new Vector3(
                Input.GetAxisRaw("Horizontal"),
                Flying ? (Input.GetKey(KeyCode.E) ? 1 : 0) - (Input.GetKey(KeyCode.Q) ? 1 : 0) : 0,
                Input.GetAxisRaw("Vertical")
            );
            sprint = Input.GetKey(KeyCode.LeftShift);
        }
#endif
    }
}
