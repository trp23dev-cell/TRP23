using UnityEngine;
#if ENABLE_INPUT_SYSTEM 
using UnityEngine.InputSystem;
#endif

/* Note: animations are called via the controller for both the character and capsule using animator null checks
 */

namespace StarterAssets
{
    [RequireComponent(typeof(CharacterController))]
#if ENABLE_INPUT_SYSTEM 
    [RequireComponent(typeof(PlayerInput))]
#endif
    public class ThirdPersonController : MonoBehaviour
    {
        [Header("Player")]
        [Tooltip("Move speed of the character in m/s")]
        public float MoveSpeed = 2.0f;

        [Tooltip("Sprint speed of the character in m/s")]
        public float SprintSpeed = 5.335f;

        [Tooltip("How fast the character turns to face movement direction")]
        [Range(0.0f, 0.3f)]
        public float RotationSmoothTime = 0.12f;

        [Tooltip("Acceleration and deceleration")]
        public float SpeedChangeRate = 10.0f;

        public AudioSource AudioFootsteps;
        public AudioSource LandingAudio;
        public AudioSource AudioFoley;
        public AudioClip LandingAudioClip;
        public AudioClip[] FootstepAudioClips;
        [Range(0, 1)] public float FootstepAudioVolume = 0.5f;

        [Space(10)]
        [Tooltip("The height the player can jump")]
        public float JumpHeight = 1.2f;

        [Tooltip("The character uses its own gravity value. The engine default is -9.81f")]
        public float Gravity = -15.0f;

        [Space(10)]
        [Tooltip("Time required to pass before being able to jump again. Set to 0f to instantly jump again")]
        public float JumpTimeout = 0.50f;

        [Tooltip("Time required to pass before entering the fall state. Useful for walking down stairs")]
        public float FallTimeout = 0.15f;

        [Header("Player Grounded")]
        [Tooltip("If the character is grounded or not. Not part of the CharacterController built in grounded check")]
        public bool Grounded = true;

        [Tooltip("Useful for rough ground")]
        public float GroundedOffset = -0.14f;

        [Tooltip("The radius of the grounded check. Should match the radius of the CharacterController")]
        public float GroundedRadius = 0.28f;

        [Tooltip("What layers the character uses as ground")]
        public LayerMask GroundLayers;

        [Header("Cinemachine")]
        [Tooltip("The follow target set in the Cinemachine Virtual Camera that the camera will follow")]
        public GameObject CinemachineCameraTarget;

        [Tooltip("How far in degrees can you move the camera up")]
        public float TopClamp = 70.0f;

        [Tooltip("How far in degrees can you move the camera down")]
        public float BottomClamp = -30.0f;

        [Tooltip("Additional degress to override the camera. Useful for fine tuning camera position when locked")]
        public float CameraAngleOverride = 0.0f;

        [Tooltip("For locking the camera position on all axis")]
        public bool LockCameraPosition = false;

        // ------------------------------------------------------------------
        // TRAP: first-person mode. Local edit to an imported package -- if you
        // reimport Starter Assets this block is what you will lose, so it is
        // kept together and marked rather than sprinkled through the file.
        //
        // Third person and first person differ in exactly two places, and both
        // are about who owns the yaw. In third person the camera orbits a body
        // that turns to face wherever it is walking. In first person the body
        // IS the head: it turns with the look, and the movement input is read
        // relative to the body so A and D strafe instead of swinging you round.
        // ------------------------------------------------------------------
        [Header("TRAP first person")]
        [Tooltip("Look through the character's eyes rather than orbiting them.")]
        public bool FirstPerson = true;

        [Tooltip("Eye height above the character's feet. 1.68m is about average " +
                 "for an adult; it is also what the web client uses, so the city " +
                 "reads at the same scale in both.")]
        public float EyeHeight = 1.68f;

        // The heading to keep coasting along once the keys are released. Third
        // person keeps _targetRotation for this; first person has no rotation
        // to remember, and without it releasing W stops you dead and throws
        // away the whole SpeedChangeRate ramp.
        private Vector3 _firstPersonHeading = Vector3.forward;

        [Tooltip("Slow down going uphill. Lincoln is built on a hill and Steep " +
                 "Hill is called that for a reason; at a flat speed the climb " +
                 "that takes eight minutes on foot takes the same time as the " +
                 "level ground beside it, which is what makes a city feel like " +
                 "a floor plan rather than a place.")]
        public bool SlowOnSlopes = true;

        [Tooltip("How hard gradient bites. 3.5 is close to Naismith's rule, the " +
                 "one walkers actually plan routes with: a 1-in-6 climb costs " +
                 "you about a third of your pace.")]
        public float SlopePenalty = 3.5f;

        // cinemachine
        private float _cinemachineTargetYaw;
        private float _cinemachineTargetPitch;

        // player
        private float _speed;
        private float _animationBlend;
        private float _targetRotation = 0.0f;
        private float _rotationVelocity;
        private float _verticalVelocity;
        private float _terminalVelocity = 53.0f;

        // timeout deltatime
        private float _jumpTimeoutDelta;
        private float _fallTimeoutDelta;

        // animation IDs
        private int _animIDSpeed;
        private int _animIDGrounded;
        private int _animIDJump;
        private int _animIDFreeFall;
        private int _animIDMotionSpeed;

#if ENABLE_INPUT_SYSTEM 
        private PlayerInput _playerInput;
#endif
        private Animator _animator;
        private CharacterController _controller;
        private StarterAssetsInputs _input;
        private GameObject _mainCamera;

        private const float _threshold = 0.01f;

        private bool _hasAnimator;

        private bool IsCurrentDeviceMouse
        {
            get
            {
#if ENABLE_INPUT_SYSTEM
                return _playerInput.currentControlScheme == "KeyboardMouse";
#else
				return false;
#endif
            }
        }


        private void Awake()
        {
            // get a reference to our main camera
            if (_mainCamera == null)
            {
                _mainCamera = GameObject.FindGameObjectWithTag("MainCamera");
            }
        }

        private void Start()
        {
            _cinemachineTargetYaw = CinemachineCameraTarget.transform.rotation.eulerAngles.y;

            _hasAnimator = TryGetComponent(out _animator);
            _controller = GetComponent<CharacterController>();
            _input = GetComponent<StarterAssetsInputs>();
#if ENABLE_INPUT_SYSTEM 
            _playerInput = GetComponent<PlayerInput>();
#else
			Debug.LogError( "Starter Assets package is missing dependencies. Please use Tools/Starter Assets/Reinstall Dependencies to fix it");
#endif

            AssignAnimationIDs();

            // reset our timeouts on start
            _jumpTimeoutDelta = JumpTimeout;
            _fallTimeoutDelta = FallTimeout;
        }

        private void Update()
        {
            // TRP23: nothing to do while the CharacterController is switched off.
            //
            // PlayerRig disables it deliberately at spawn and holds the player
            // there until the tile underneath has streamed in — otherwise they
            // spend the first second accelerating downwards through a city that
            // has not arrived yet. This kept calling Move() on it regardless,
            // which Unity logs as an error, once per frame, on every single
            // launch. Six red lines in the console that mean nothing are worse
            // than none, because they are where a real one goes to hide.
            if (_controller == null || !_controller.enabled) return;

            _hasAnimator = TryGetComponent(out _animator);

            JumpAndGravity();
            GroundedCheck();
            Move();
        }

        private void LateUpdate()
        {
            // TRP23: a free cursor means the player is using the interface, not
            // looking around, so the camera stays where they left it.
            //
            // Freezing time does not cover this. Mouse look is deliberately NOT
            // multiplied by Time.deltaTime a few lines down — see the comment
            // there — so at timeScale 0 the world stops and the camera carries
            // on turning, which is worse than not pausing at all: you read your
            // case file and look up somewhere else.
            //
            // Cursor state rather than PointerFocus because it is the same
            // answer without reaching across into game code, and because it is
            // right for every reason the cursor is free, not just a panel.
            if (Cursor.lockState != CursorLockMode.Locked) return;

            CameraRotation();
        }

        private void AssignAnimationIDs()
        {
            _animIDSpeed = Animator.StringToHash("Speed");
            _animIDGrounded = Animator.StringToHash("Grounded");
            _animIDJump = Animator.StringToHash("Jump");
            _animIDFreeFall = Animator.StringToHash("FreeFall");
            _animIDMotionSpeed = Animator.StringToHash("MotionSpeed");
        }

        private void GroundedCheck()
        {
            // set sphere position, with offset
            Vector3 spherePosition = new Vector3(transform.position.x, transform.position.y - GroundedOffset,
                transform.position.z);
            Grounded = Physics.CheckSphere(spherePosition, GroundedRadius, GroundLayers,
                QueryTriggerInteraction.Ignore);

            // update animator if using character
            if (_hasAnimator)
            {
                _animator.SetBool(_animIDGrounded, Grounded);
            }
        }

        private void CameraRotation()
        {
            // if there is an input and camera position is not fixed
            if (_input.look.sqrMagnitude >= _threshold && !LockCameraPosition)
            {
                //Don't multiply mouse input by Time.deltaTime;
                float deltaTimeMultiplier = IsCurrentDeviceMouse ? 1.0f : Time.deltaTime;

                _cinemachineTargetYaw += _input.look.x * deltaTimeMultiplier;
                _cinemachineTargetPitch += _input.look.y * deltaTimeMultiplier;
            }

            // clamp our rotations so our values are limited 360 degrees
            _cinemachineTargetYaw = ClampAngle(_cinemachineTargetYaw, float.MinValue, float.MaxValue);
            // Third person deliberately limits how far you can look up and down
            // so the camera does not clip the ground or the character's scalp.
            // In first person there is no camera arm to clip, and being unable
            // to look up at Lincoln Cathedral would be a strange thing to ship.
            _cinemachineTargetPitch = FirstPerson
                ? ClampAngle(_cinemachineTargetPitch, -89.0f, 89.0f)
                : ClampAngle(_cinemachineTargetPitch, BottomClamp, TopClamp);

            if (FirstPerson)
            {
                // Turn the BODY. In first person the head and the body are the
                // same thing, and letting them disagree is what makes a
                // converted third-person rig feel like it is on a swivel.
                transform.rotation = Quaternion.Euler(0.0f, _cinemachineTargetYaw, 0.0f);
                // World position, not local. PlayerCameraRoot's parent is not
                // guaranteed to be the character root -- on the armature prefab
                // it is nested inside the rig -- and a local offset would then
                // be measured from a bone rather than from the feet.
                CinemachineCameraTarget.transform.position = transform.position + Vector3.up * EyeHeight;
                CinemachineCameraTarget.transform.rotation =
                    Quaternion.Euler(_cinemachineTargetPitch + CameraAngleOverride, _cinemachineTargetYaw, 0.0f);
                return;
            }

            // Cinemachine will follow this target
            CinemachineCameraTarget.transform.rotation = Quaternion.Euler(_cinemachineTargetPitch + CameraAngleOverride,
                _cinemachineTargetYaw, 0.0f);
        }

        private void Move()
        {
            // set target speed based on move speed, sprint speed and if sprint is pressed
            float targetSpeed = _input.sprint ? SprintSpeed : MoveSpeed;

            // a simplistic acceleration and deceleration designed to be easy to remove, replace, or iterate upon

            // note: Vector2's == operator uses approximation so is not floating point error prone, and is cheaper than magnitude
            // if there is no input, set the target speed to 0
            if (_input.move == Vector2.zero) targetSpeed = 0.0f;

            if (SlowOnSlopes && targetSpeed > 0.0f) targetSpeed *= SlopeFactor();

            // a reference to the players current horizontal velocity
            float currentHorizontalSpeed = new Vector3(_controller.velocity.x, 0.0f, _controller.velocity.z).magnitude;

            float speedOffset = 0.1f;
            float inputMagnitude = _input.analogMovement ? _input.move.magnitude : 1f;

            // accelerate or decelerate to target speed
            if (currentHorizontalSpeed < targetSpeed - speedOffset ||
                currentHorizontalSpeed > targetSpeed + speedOffset)
            {
                // creates curved result rather than a linear one giving a more organic speed change
                // note T in Lerp is clamped, so we don't need to clamp our speed
                _speed = Mathf.Lerp(currentHorizontalSpeed, targetSpeed * inputMagnitude,
                    Time.deltaTime * SpeedChangeRate);

                // round speed to 3 decimal places
                _speed = Mathf.Round(_speed * 1000f) / 1000f;
            }
            else
            {
                _speed = targetSpeed;
            }

            _animationBlend = Mathf.Lerp(_animationBlend, targetSpeed, Time.deltaTime * SpeedChangeRate);
            if (_animationBlend < 0.01f) _animationBlend = 0f;

            // normalise input direction
            Vector3 inputDirection = new Vector3(_input.move.x, 0.0f, _input.move.y).normalized;

            // note: Vector2's != operator uses approximation so is not floating point error prone, and is cheaper than magnitude
            // if there is a move input rotate player when the player is moving
            if (FirstPerson)
            {
                // The body already faces where you are looking, so the input is
                // simply relative to it. Nothing to rotate, and no smoothing --
                // smoothing the turn here would lag the body behind the view.
                _targetRotation = transform.eulerAngles.y;
            }
            else if (_input.move != Vector2.zero)
            {
                _targetRotation = Mathf.Atan2(inputDirection.x, inputDirection.z) * Mathf.Rad2Deg +
                                  _mainCamera.transform.eulerAngles.y;
                float rotation = Mathf.SmoothDampAngle(transform.eulerAngles.y, _targetRotation, ref _rotationVelocity,
                    RotationSmoothTime);

                // rotate to face input direction relative to camera position
                transform.rotation = Quaternion.Euler(0.0f, rotation, 0.0f);
            }


            // In first person, strafing has to be a real direction rather than
            // "forward, after turning to face it" -- otherwise pressing A walks
            // you sideways while the view stays put only because the body spun.
            if (FirstPerson && inputDirection != Vector3.zero)
                _firstPersonHeading = transform.TransformDirection(inputDirection);

            Vector3 targetDirection = FirstPerson
                ? _firstPersonHeading
                : Quaternion.Euler(0.0f, _targetRotation, 0.0f) * Vector3.forward;

            // move the player
            _controller.Move(targetDirection.normalized * (_speed * Time.deltaTime) +
                             new Vector3(0.0f, _verticalVelocity, 0.0f) * Time.deltaTime);

            // update animator if using character
            if (_hasAnimator)
            {
                _animator.SetFloat(_animIDSpeed, _animationBlend);
                _animator.SetFloat(_animIDMotionSpeed, inputMagnitude);
            }
        }

        /// <summary>
        /// How much of your pace the ground under you leaves you.
        ///
        /// Taken from the surface normal rather than from how far you climbed
        /// last frame: the frame-to-frame version reads as noise on a stepped
        /// heightmap and makes the speed flicker.
        /// </summary>
        private float SlopeFactor()
        {
            Vector3 heading = FirstPerson
                ? _firstPersonHeading
                : Quaternion.Euler(0.0f, _targetRotation, 0.0f) * Vector3.forward;
            heading.y = 0.0f;
            if (heading.sqrMagnitude < 0.0001f) return 1.0f;
            heading.Normalize();

            // Start above the feet, or the ray begins inside the ground on any
            // slope and hits nothing.
            Vector3 from = transform.position + Vector3.up * 0.5f;
            if (!Physics.Raycast(from, Vector3.down, out RaycastHit hit, 3.0f, GroundLayers,
                    QueryTriggerInteraction.Ignore))
                return 1.0f;

            // Rise over run in the direction of travel. Positive is uphill.
            Vector3 n = hit.normal;
            if (n.y < 0.01f) return 1.0f;
            float grade = -(n.x * heading.x + n.z * heading.z) / n.y;

            if (grade > 0.0f)
                return Mathf.Clamp(1.0f / (1.0f + SlopePenalty * grade), 0.3f, 1.0f);

            // Downhill is quicker, but only up to a point -- past about 1 in 4
            // you are picking your way down rather than striding.
            float drop = -grade;
            return drop < 0.25f
                ? Mathf.Lerp(1.0f, 1.12f, drop / 0.25f)
                : Mathf.Clamp(1.12f - (drop - 0.25f) * 1.4f, 0.45f, 1.12f);
        }

        private void JumpAndGravity()
        {
            if (Grounded)
            {
                // reset the fall timeout timer
                _fallTimeoutDelta = FallTimeout;

                // update animator if using character
                if (_hasAnimator)
                {
                    _animator.SetBool(_animIDJump, false);
                    _animator.SetBool(_animIDFreeFall, false);
                }

                // stop our velocity dropping infinitely when grounded
                if (_verticalVelocity < 0.0f)
                {
                    _verticalVelocity = -2f;
                }

                // Jump
                if (_input.jump && _jumpTimeoutDelta <= 0.0f)
                {
                    // the square root of H * -2 * G = how much velocity needed to reach desired height
                    _verticalVelocity = Mathf.Sqrt(JumpHeight * -2f * Gravity);

                    // update animator if using character
                    if (_hasAnimator)
                    {
                        _animator.SetBool(_animIDJump, true);
                    }
                }

                // jump timeout
                if (_jumpTimeoutDelta >= 0.0f)
                {
                    _jumpTimeoutDelta -= Time.deltaTime;
                }
            }
            else
            {
                // reset the jump timeout timer
                _jumpTimeoutDelta = JumpTimeout;

                // fall timeout
                if (_fallTimeoutDelta >= 0.0f)
                {
                    _fallTimeoutDelta -= Time.deltaTime;
                }
                else
                {
                    // update animator if using character
                    if (_hasAnimator)
                    {
                        _animator.SetBool(_animIDFreeFall, true);
                    }
                }

                // if we are not grounded, do not jump
                _input.jump = false;
            }

            // apply gravity over time if under terminal (multiply by delta time twice to linearly speed up over time)
            if (_verticalVelocity < _terminalVelocity)
            {
                _verticalVelocity += Gravity * Time.deltaTime;
            }
        }

        private static float ClampAngle(float lfAngle, float lfMin, float lfMax)
        {
            if (lfAngle < -360f) lfAngle += 360f;
            if (lfAngle > 360f) lfAngle -= 360f;
            return Mathf.Clamp(lfAngle, lfMin, lfMax);
        }

        private void OnDrawGizmosSelected()
        {
            Color transparentGreen = new Color(0.0f, 1.0f, 0.0f, 0.35f);
            Color transparentRed = new Color(1.0f, 0.0f, 0.0f, 0.35f);

            if (Grounded) Gizmos.color = transparentGreen;
            else Gizmos.color = transparentRed;

            // when selected, draw a gizmo in the position of, and matching radius of, the grounded collider
            Gizmos.DrawSphere(
                new Vector3(transform.position.x, transform.position.y - GroundedOffset, transform.position.z),
                GroundedRadius);
        }

        private void OnFootstep(AnimationEvent animationEvent)
        {
            if (animationEvent.animatorClipInfo.weight > 0.5f)
            {

                if (AudioFootsteps != null)
                    AudioFootsteps.Play();
                if (AudioFoley != null)
                    AudioFoley.Play();
            }
        }

        private void OnLand(AnimationEvent animationEvent)
        {
            if (animationEvent.animatorClipInfo.weight > 0.5f)
            {
                if (LandingAudio != null)
                    LandingAudio.Play();

            }
        }
    }
}