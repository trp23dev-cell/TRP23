using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace TrapMadeIt.World
{
    /// <summary>
    /// The player, walking around Lincoln. Owned by this project.
    ///
    /// WHY THIS EXISTS
    ///
    /// This replaces Unity's Starter Assets ThirdPersonController, which was
    /// carrying four TRP23 features as local patches — first person, eye
    /// height, slope cost and a disabled-controller guard — inside a file whose
    /// 270 companion files were untracked. So a fresh clone had no player, CI
    /// could never build one, and the one script we did track could not be
    /// compile-checked because its dependencies were absent.
    ///
    /// What it deliberately is NOT: an animation system, a combat rig, a
    /// crouch/climb/swim framework, or a third-person camera. It is the
    /// smallest controller that walks a person around a streamed city on real
    /// terrain, and it should stay that way until something concrete needs more.
    ///
    /// INPUT comes from the project-wide InputSystem_Actions asset, resolved
    /// once into typed actions. No key or button appears anywhere below —
    /// device differences live in bindings, which is what makes gamepad and
    /// touch work without this file knowing they exist.
    ///
    /// FIRST PERSON ONLY. The Starter Assets original supported both; third
    /// person was never used by TRP23 and carried the whole camera-orbit and
    /// rotation-smoothing path with it. Rebuilding an unused mode would be
    /// exactly the speculative complexity the migration is trying to avoid.
    /// If third person is ever wanted, it is a new package with a real reason.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class TrapPlayerController : MonoBehaviour
    {
        // ---------------------------------------------------------------- move
        [Header("Movement")]
        [Tooltip("A walk, in metres per second. 1.4 is average human pace.")]
        public float walkSpeed = 1.4f;

        [Tooltip("A run, not a sprint finish.")]
        public float sprintSpeed = 4.5f;

        [Tooltip("How quickly speed catches up to the target. Higher is snappier; "
               + "too high and starting to walk feels like being pushed.")]
        public float speedChangeRate = 10f;

        [Header("Looking")]
        [Tooltip("Degrees per unit of look input from a mouse.")]
        public float mouseSensitivity = 0.12f;

        [Tooltip("Degrees per second from a gamepad stick. Separate because a "
               + "stick is a rate and a mouse is a distance — one value cannot "
               + "serve both without one of them feeling wrong.")]
        public float stickSensitivity = 140f;

        [Tooltip("How far up and down you may look. Not the third-person clamp: "
               + "there is no camera arm to clip, and being unable to look up at "
               + "the Cathedral would be a strange thing to ship.")]
        public float pitchLimit = 89f;

        [Header("Falling and jumping")]
        public float jumpHeight = 0.55f;      // a person, not a pole vaulter
        public float gravity = -15f;
        public float terminalVelocity = 53f;

        [Tooltip("Grace period after landing before you may jump again.")]
        public float jumpTimeout = 0.5f;

        [Tooltip("Grace period after walking off an edge before gravity is "
               + "allowed to say you are falling. Stops a kerb reading as a cliff.")]
        public float fallTimeout = 0.15f;

        [Header("Ground")]
        [Tooltip("The streamed city is built at runtime on the Default layer, so "
               + "that is what counts as ground. Left empty, CheckSphere finds "
               + "nothing, Grounded stays false, and you fall through Lincoln "
               + "for ever while looking perfectly fine.")]
        public LayerMask groundLayers = 1;    // Default

        public float groundedOffset = -0.14f;
        public float groundedRadius = 0.28f;

        [Header("Slope")]
        [Tooltip("Slow down going uphill. Lincoln is built on a hill and Steep "
               + "Hill is called that for a reason; at a flat speed the climb "
               + "takes as long as the level ground beside it, which is what "
               + "makes a city read as a floor plan rather than a place.")]
        public bool slowOnSlopes = true;

        [Tooltip("How hard gradient bites. 3.5 is close to Naismith's rule, the "
               + "one walkers actually plan routes with: a 1-in-6 climb costs "
               + "about a third of your pace.")]
        public float slopePenalty = 3.5f;

        [Header("Eyes")]
        [Tooltip("Eye height above the feet. 1.68m is about average for an "
               + "adult, and it is what the web client uses — so the city reads "
               + "at the same scale in both.")]
        public float eyeHeight = 1.68f;

        [Tooltip("Where the camera sits. Created automatically if left empty.")]
        public Transform cameraTarget;

        /// <summary>True when the ground check found something underfoot.</summary>
        public bool Grounded { get; private set; } = true;

        /// <summary>Current horizontal speed, for anything that wants to show it.</summary>
        public float Speed { get; private set; }

        CharacterController _controller;
        float _speed;
        float _verticalVelocity;
        float _jumpTimeoutDelta;
        float _fallTimeoutDelta;
        float _yaw;
        float _pitch;

        // The heading to keep coasting along once the keys are released.
        // Without it, releasing W stops you dead and throws away the whole
        // speedChangeRate ramp.
        Vector3 _heading = Vector3.forward;

#if ENABLE_INPUT_SYSTEM
        InputAction _move, _look, _jump, _sprint;
        InputActionMap _playerMap;
        bool _actionsReady;
        // What the gate was last frame, so the map is only switched on the
        // transition rather than every frame.
        bool _inputBlocked;
#endif

        // Resolved once, by name, in one place. Everywhere else uses the typed
        // action — so a rebinding is an asset change and never a code change.
        const string PlayerMap = "Player";
        const string MoveAction = "Move";
        const string LookAction = "Look";
        const string JumpAction = "Jump";
        const string SprintAction = "Sprint";

        void Awake()
        {
            _controller = GetComponent<CharacterController>();
            _jumpTimeoutDelta = jumpTimeout;
            _fallTimeoutDelta = fallTimeout;
            _yaw = transform.eulerAngles.y;

            if (cameraTarget == null)
            {
                var head = new GameObject("PlayerCameraRoot");
                head.transform.SetParent(transform, false);
                cameraTarget = head.transform;
            }

#if ENABLE_INPUT_SYSTEM
            ResolveActions();
#endif
        }

#if ENABLE_INPUT_SYSTEM
        /// <summary>
        /// Bind to the project-wide actions asset.
        ///
        /// InputSystem.actions is the asset set in Project Settings, which is
        /// the tracked InputSystem_Actions.inputactions. Taking it from there
        /// rather than a serialized field means a scene built by the setup tool
        /// needs no wiring, and there is exactly one input asset in the project
        /// rather than a second one that drifts.
        /// </summary>
        void ResolveActions()
        {
            var asset = InputSystem.actions;
            if (asset == null)
            {
                Debug.LogWarning("[player] no project-wide input actions asset — " +
                                 "set it in Project Settings > Input System. Movement is disabled.");
                return;
            }

            var map = asset.FindActionMap(PlayerMap, false);
            if (map == null)
            {
                Debug.LogWarning($"[player] input asset has no '{PlayerMap}' action map. Movement is disabled.");
                return;
            }

            _playerMap = map;
            _move = map.FindAction(MoveAction, false);
            _look = map.FindAction(LookAction, false);
            _jump = map.FindAction(JumpAction, false);
            _sprint = map.FindAction(SprintAction, false);

            // Say which one is missing rather than failing silently on a rename.
            if (_move == null || _look == null || _jump == null || _sprint == null)
            {
                Debug.LogWarning($"[player] missing actions in '{PlayerMap}': " +
                                 $"{(_move == null ? "Move " : "")}{(_look == null ? "Look " : "")}" +
                                 $"{(_jump == null ? "Jump " : "")}{(_sprint == null ? "Sprint" : "")}");
            }

            map.Enable();
            _actionsReady = true;
        }
#endif

        /// <summary>
        /// Whether the player may act at all.
        ///
        /// Two reasons not to: the CharacterController is switched off — PlayerRig
        /// does that on purpose at spawn, holding you until the tile underneath
        /// has streamed in — or something is holding the pointer, which means a
        /// panel is open and the input belongs to it.
        ///
        /// PointerFocus rather than a private flag, because the cursor and the
        /// pause already have one owner each and adding a third would be the
        /// exact fight those registers exist to prevent.
        /// </summary>
        bool CanAct => _controller != null && _controller.enabled && GameplayInput.Allowed;

#if ENABLE_INPUT_SYSTEM
        /// <summary>
        /// Switch the whole Player action map off while a UI holds the pointer.
        ///
        /// This is the actual fix, and it is at the source rather than at each
        /// reader. A disabled map returns zero from every action, so nothing
        /// downstream can rotate the camera by forgetting to check a flag —
        /// which is exactly how the map ended up freezing the world while the
        /// view kept turning.
        ///
        /// It also settles the stale-delta question for free. Re-enabling an
        /// action map resets its state, so the mouse movement made while the
        /// map was open is not sitting in a buffer waiting to be applied as one
        /// jump on the frame you close it. No timer, no skipped frame.
        /// </summary>
        void ApplyInputGate()
        {
            bool blocked = GameplayInput.Blocked;
            if (blocked == _inputBlocked) return;
            _inputBlocked = blocked;

            if (_playerMap == null) return;
            if (blocked) _playerMap.Disable();
            else _playerMap.Enable();
        }
#endif

        void Update()
        {
#if ENABLE_INPUT_SYSTEM
            // Before the early return: the gate has to keep being applied while
            // blocked, or the map is never switched back on.
            ApplyInputGate();
#endif
            if (!CanAct) return;
            GroundedCheck();
            JumpAndGravity();
            Move();
        }

        void LateUpdate()
        {
            if (!CanAct) return;
            Look();
        }

        // ------------------------------------------------------------- looking

        void Look()
        {
#if ENABLE_INPUT_SYSTEM
            if (!_actionsReady || _look == null) return;
            Vector2 look = _look.ReadValue<Vector2>();
            if (look.sqrMagnitude < 0.0001f) { AimHead(); return; }

            // A mouse reports a DISTANCE already moved, so scaling it by frame
            // time makes sensitivity depend on frame rate. A stick reports a
            // RATE held, so it must be scaled by frame time or it does depend on
            // frame rate. Same input, opposite treatment — getting this backwards
            // is why ported controllers feel wrong on one device or the other.
            bool isMouse = Mouse.current != null && _look.activeControl != null
                           && _look.activeControl.device == Mouse.current;

            if (isMouse)
            {
                _yaw += look.x * mouseSensitivity;
                _pitch -= look.y * mouseSensitivity;
            }
            else
            {
                _yaw += look.x * stickSensitivity * Time.deltaTime;
                _pitch -= look.y * stickSensitivity * Time.deltaTime;
            }

            _pitch = Mathf.Clamp(_pitch, -pitchLimit, pitchLimit);
#endif
            AimHead();
        }

        /// The body turns with the look: in first person the head and the body
        /// are the same thing, and letting them disagree is what makes a
        /// converted third-person rig feel like it is on a swivel.
        void AimHead()
        {
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            if (cameraTarget == null) return;
            // World position, not local: the target may be nested, and a local
            // offset would then be measured from whatever it hangs off.
            cameraTarget.position = transform.position + Vector3.up * eyeHeight;
            cameraTarget.rotation = Quaternion.Euler(_pitch, _yaw, 0f);
        }

        // ------------------------------------------------------------ movement

        void Move()
        {
            Vector2 input = Vector2.zero;
            bool sprinting = false;
#if ENABLE_INPUT_SYSTEM
            if (_actionsReady)
            {
                if (_move != null) input = _move.ReadValue<Vector2>();
                if (_sprint != null) sprinting = _sprint.IsPressed();
            }
#endif

            float target = sprinting ? sprintSpeed : walkSpeed;
            if (input.sqrMagnitude < 0.0001f) target = 0f;
            if (slowOnSlopes && target > 0f) target *= SlopeFactor();

            // Toward the target rather than at it, so starting and stopping
            // have weight. Frame-rate independent: the lerp is driven by
            // deltaTime, not by how often Update happens to run.
            float current = new Vector3(_controller.velocity.x, 0f, _controller.velocity.z).magnitude;
            const float deadband = 0.1f;
            _speed = (current < target - deadband || current > target + deadband)
                ? Mathf.Lerp(current, target * Mathf.Clamp01(input.magnitude), Time.deltaTime * speedChangeRate)
                : target;
            Speed = _speed;

            // Strafing has to be a real direction rather than "forward, after
            // turning to face it" — otherwise pressing A walks you sideways
            // only because the body spun to point that way.
            Vector3 direction = new Vector3(input.x, 0f, input.y).normalized;
            if (direction.sqrMagnitude > 0.0001f) _heading = transform.TransformDirection(direction);

            _controller.Move(_heading.normalized * (_speed * Time.deltaTime)
                             + new Vector3(0f, _verticalVelocity, 0f) * Time.deltaTime);
        }

        /// <summary>
        /// How much the gradient underfoot costs, in the direction of travel.
        /// 1 is flat, below 1 is slower, above 1 is a helpful descent.
        /// </summary>
        float SlopeFactor()
        {
            Vector3 heading = _heading;
            heading.y = 0f;
            if (heading.sqrMagnitude < 0.0001f) return 1f;
            heading.Normalize();

            // Start above the feet, or on any slope the ray begins inside the
            // ground and hits nothing.
            Vector3 from = transform.position + Vector3.up * 0.5f;
            if (!Physics.Raycast(from, Vector3.down, out RaycastHit hit, 3f, groundLayers,
                    QueryTriggerInteraction.Ignore))
                return 1f;

            Vector3 n = hit.normal;
            if (n.y < 0.01f) return 1f;
            // Rise over run along the heading. Positive is uphill.
            float grade = -(n.x * heading.x + n.z * heading.z) / n.y;

            // The curve itself lives in Core, where it is scalar, engine-free
            // and checked by npm run check:world. Finding the ground is this
            // file's job; deciding what a gradient is worth is not.
            return SlopeCost.For(grade, slopePenalty);
        }

        // ----------------------------------------------------- ground and jump

        void GroundedCheck()
        {
            Vector3 at = new Vector3(transform.position.x,
                                     transform.position.y - groundedOffset,
                                     transform.position.z);
            Grounded = Physics.CheckSphere(at, groundedRadius, groundLayers,
                                           QueryTriggerInteraction.Ignore);
        }

        void JumpAndGravity()
        {
            bool jumpPressed = false;
#if ENABLE_INPUT_SYSTEM
            if (_actionsReady && _jump != null) jumpPressed = _jump.WasPressedThisFrame();
#endif

            if (Grounded)
            {
                _fallTimeoutDelta = fallTimeout;

                // A small downward bias rather than zero: exactly zero lets the
                // controller drift off the ground on slopes and re-report
                // Grounded every other frame.
                if (_verticalVelocity < 0f) _verticalVelocity = -2f;

                if (jumpPressed && _jumpTimeoutDelta <= 0f)
                    _verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);

                if (_jumpTimeoutDelta >= 0f) _jumpTimeoutDelta -= Time.deltaTime;
            }
            else
            {
                _jumpTimeoutDelta = jumpTimeout;
                if (_fallTimeoutDelta >= 0f) _fallTimeoutDelta -= Time.deltaTime;
            }

            if (_verticalVelocity < terminalVelocity) _verticalVelocity += gravity * Time.deltaTime;
        }

        /// <summary>
        /// Put the player somewhere, facing a direction, without the controller
        /// fighting the move. Used by PlayerRig when it drops you onto the first
        /// tile, and by anything that teleports later.
        /// </summary>
        public void Teleport(Vector3 position, float yaw)
        {
            bool had = _controller != null && _controller.enabled;
            if (had) _controller.enabled = false;
            transform.position = position;
            _yaw = yaw;
            _verticalVelocity = 0f;
            _heading = Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
            if (had) _controller.enabled = true;
            AimHead();
        }

        void OnDrawGizmosSelected()
        {
            Gizmos.color = Grounded ? Color.green : Color.red;
            Gizmos.DrawWireSphere(new Vector3(transform.position.x,
                                              transform.position.y - groundedOffset,
                                              transform.position.z), groundedRadius);
        }
    }
}
