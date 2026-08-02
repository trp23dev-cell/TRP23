using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Makes an off-the-shelf character controller survive a streamed city.
    ///
    /// Any imported controller -- Starter Assets, the URP sample, one you wrote
    /// -- assumes the ground already exists when it starts falling. Here it does
    /// not: the world arrives a tile at a time over HTTP, and for the first
    /// second or so there is nothing under the player at all. Left alone, a
    /// CharacterController spends that second accelerating downwards and is
    /// several hundred metres below Lincoln by the time the ground turns up.
    ///
    /// Three jobs, all of them about there being exactly one authority over
    /// where the player is:
    ///
    ///   HOLD until the tile underneath has loaded, then drop them onto it.
    ///   RESCUE anyone who ends up under the terrain anyway -- a seam, a tile
    ///     evicted while they stood on it, a fall off the edge of the loaded
    ///     area -- rather than letting them fall forever.
    ///   STAND DOWN so the streamer's own ground-pinning stops fighting the
    ///     controller for the transform. Two things writing position every
    ///     frame is a bug that reads as jitter and is miserable to find.
    ///
    /// Put this on the player root, next to the controller.
    /// </summary>
    public class PlayerRig : MonoBehaviour
    {
        [Tooltip("Leave empty to find the one in the scene.")]
        public WorldStreamer world;

        [Tooltip("Feet-to-ground clearance when placed. The controller's own " +
                 "height and centre take over from there.")]
        public float footClearance = 0.05f;

        [Tooltip("How far below the ground counts as having fallen through.")]
        public float fallLimit = 5f;

        [Tooltip("Seconds to wait for the ground before giving up and placing " +
                 "the player anyway, so a dead server does not mean a dead scene.")]
        public float patience = 20f;

        /// True once the player has been put on real ground.
        public bool Placed { get; private set; }

        CharacterController controller;
        Rigidbody body;
        float waited;
        bool wasControllerEnabled;

        void Awake()
        {
            if (world == null) world = FindAnyObjectByType<WorldStreamer>();
            controller = GetComponent<CharacterController>();
            body = GetComponent<Rigidbody>();

            // Freeze before the first physics step, not after it. By Start()
            // a CharacterController has already had a frame of gravity.
            if (controller != null)
            {
                wasControllerEnabled = controller.enabled;
                controller.enabled = false;
            }
            if (body != null) body.isKinematic = true;
        }

        void Update()
        {
            if (world == null) return;

            if (!Placed)
            {
                waited += Time.deltaTime;
                if (TryPlace()) Release();
                else if (waited > patience)
                {
                    Debug.LogWarning($"[player] no ground under the spawn after {patience:F0}s — " +
                                     "releasing anyway. Check the map server is up.");
                    Release();
                }
                return;
            }

            // Fallen through. Do not try to be clever about why: put them back
            // on the surface and let them carry on.
            if (world.TryGroundHeight(transform.position.x, transform.position.z, out float ground)
                && transform.position.y < ground - fallLimit)
            {
                Debug.LogWarning($"[player] fell through at {transform.position.x:F0},{transform.position.z:F0} — " +
                                 "put back on the surface.");
                PlaceAt(ground);
            }
        }

        bool TryPlace()
        {
            if (!world.TryGroundHeight(transform.position.x, transform.position.z, out float ground))
                return false;
            PlaceAt(ground);
            return true;
        }

        /// <summary>
        /// Move the player to the surface. A CharacterController has to be
        /// switched off across the move: it caches its position internally and
        /// writing transform.position while it is enabled is either ignored or
        /// fought, depending on the Unity version.
        /// </summary>
        void PlaceAt(float ground)
        {
            bool had = controller != null && controller.enabled;
            if (had) controller.enabled = false;

            // The controller's origin sits at the middle of its capsule, so its
            // feet are half a height below. Without this it is placed knee-deep.
            float lift = controller != null ? controller.height * 0.5f - controller.center.y : 0f;
            var p = transform.position;
            p.y = ground + lift + footClearance;
            transform.position = p;

            if (body != null) body.linearVelocity = Vector3.zero;
            if (had) controller.enabled = true;
        }

        void Release()
        {
            Placed = true;
            if (controller != null) controller.enabled = wasControllerEnabled;
            if (body != null) body.isKinematic = false;

            // From here the controller owns the transform. The streamer must
            // stop pinning to the ground or the two will argue every frame.
            if (world != null) world.pinToGround = false;

            Debug.Log($"[player] on the ground at {transform.position.x:F0},{transform.position.z:F0}, " +
                      $"height {transform.position.y:F1}m");
        }
    }
}
