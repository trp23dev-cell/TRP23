using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.World
{
    /// <summary>
    /// A camera to fly around the city with while the world is being built.
    /// Not the player controller — that walks on the ground and collides.
    ///
    /// This project runs the new Input System (activeInputHandler: 1), where
    /// the old UnityEngine.Input class throws on every call rather than
    /// returning nothing. Both paths are here because the project setting is
    /// exactly the kind of thing that gets changed later, and a camera that
    /// silently stops responding is a bad way to find out.
    /// </summary>
    public class FlyCamera : MonoBehaviour
    {
        public float speed = 20f;
        public float sprintMultiplier = 5f;
        public float lookSensitivity = 0.12f;

        float yaw, pitch;

        void Start()
        {
            var e = transform.rotation.eulerAngles;
            yaw = e.y;
            pitch = e.x > 180f ? e.x - 360f : e.x;
        }

        void Update()
        {
            ReadLook(out float lookX, out float lookY, out bool looking);
            if (looking)
            {
                yaw += lookX * lookSensitivity;
                pitch = Mathf.Clamp(pitch - lookY * lookSensitivity, -89f, 89f);
                transform.rotation = Quaternion.Euler(pitch, yaw, 0f);
            }

            ReadMove(out Vector3 move, out bool sprint);
            if (move.sqrMagnitude < 0.0001f) return;

            float s = speed * (sprint ? sprintMultiplier : 1f);
            transform.position += transform.TransformDirection(move.normalized) * s * Time.deltaTime;
        }

#if ENABLE_INPUT_SYSTEM
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
            float up = (k.eKey.isPressed ? 1f : 0f) - (k.qKey.isPressed ? 1f : 0f);
            move = new Vector3(h, up, v);
            sprint = k.leftShiftKey.isPressed;
        }
#else
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
                (Input.GetKey(KeyCode.E) ? 1 : 0) - (Input.GetKey(KeyCode.Q) ? 1 : 0),
                Input.GetAxisRaw("Vertical")
            );
            sprint = Input.GetKey(KeyCode.LeftShift);
        }
#endif
    }
}
