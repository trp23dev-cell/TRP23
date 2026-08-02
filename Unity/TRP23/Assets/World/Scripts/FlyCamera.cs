using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// A camera you can fly around the city with, for looking at the world
    /// while it is being built. Not the player controller — that comes later,
    /// walks on the ground and collides with things.
    /// </summary>
    public class FlyCamera : MonoBehaviour
    {
        public float speed = 20f;
        public float sprintMultiplier = 5f;
        public float lookSensitivity = 2.5f;

        float yaw, pitch;

        void Start()
        {
            var e = transform.rotation.eulerAngles;
            yaw = e.y;
            pitch = e.x;
        }

        void Update()
        {
            // Right mouse to look, so the cursor stays usable in the editor.
            if (Input.GetMouseButton(1))
            {
                yaw += Input.GetAxis("Mouse X") * lookSensitivity;
                pitch = Mathf.Clamp(pitch - Input.GetAxis("Mouse Y") * lookSensitivity, -89f, 89f);
                transform.rotation = Quaternion.Euler(pitch, yaw, 0f);
            }

            var move = new Vector3(
                Input.GetAxisRaw("Horizontal"),
                (Input.GetKey(KeyCode.E) ? 1 : 0) - (Input.GetKey(KeyCode.Q) ? 1 : 0),
                Input.GetAxisRaw("Vertical")
            );
            if (move.sqrMagnitude < 0.0001f) return;

            float s = speed * (Input.GetKey(KeyCode.LeftShift) ? sprintMultiplier : 1f);
            transform.position += transform.TransformDirection(move.normalized) * s * Time.deltaTime;
        }
    }
}
