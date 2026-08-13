// Minimal stand-ins for the Unity APIs the auth scripts touch, so the C# can be
// type-checked without the editor. Not a Unity emulator — just enough surface
// for the compiler to prove the code is valid.
using System;
using System.Collections;
namespace UnityEngine {
  public class Object {
    public static T FindFirstObjectByType<T>() where T : Object => null;}
  public class MonoBehaviour : Component { public Transform transform => null; public bool enabled { get; set; } public static T FindAnyObjectByType<T>() where T : Component, new() => new T(); public static T[] FindObjectsByType<T>(FindObjectsSortMode m) where T : Component => new T[0]; public Coroutine StartCoroutine(IEnumerator r) => null; public void Invoke(string m, float t) {} public void CancelInvoke() {} public void CancelInvoke(string m) {} public static void DontDestroyOnLoad(Object o) {} public static void Destroy(Object o) {} }
  public class Coroutine {}
  public class WaitForSeconds { public WaitForSeconds(float s) {} }
  public static class PlayerPrefs {
    public static string GetString(string k, string d) => d;
    public static void SetString(string k, string v) {}
    public static void DeleteKey(string k) {}
    public static void Save() {}
  }
  public static class Debug { public static void LogWarning(object m) {} public static void Log(object m) {} public static void LogError(object m) {} }
  public static class JsonUtility {
    public static string ToJson(object o) => "";
    public static T FromJson<T>(string s) => default(T);
  }
  public class HeaderAttribute : Attribute { public HeaderAttribute(string h) {} }
  public class TooltipAttribute : Attribute { public TooltipAttribute(string t) {} }
  public class HideInInspector : Attribute {}
  public class DisallowMultipleComponentAttribute : Attribute {}
  public class ExecuteAlwaysAttribute : Attribute {}
  public class DefaultExecutionOrderAttribute : Attribute { public DefaultExecutionOrderAttribute(int order) {} }
  public class SerializeFieldAttribute : Attribute {}
  public class GameObject : Object {
    public GameObject() {}
    public GameObject(string name) {}
    public string tag { get; set; }
    public string name { get; set; }
    public void SetActive(bool on) {}
    public T GetComponent<T>() where T : Component, new() => new T();
    public Transform transform => null;
    public T AddComponent<T>() where T : Component, new() => new T();
  }
  public class Component : Object {
    public GameObject gameObject => null;
    public T GetComponent<T>() where T : Component, new() => new T();
    // Interface lookups are the point of these two, so they cannot be
    // constrained to Component the way GetComponent above is.
    public T GetComponentInChildren<T>(bool includeInactive = false) => default(T);
    public T[] GetComponentsInChildren<T>(bool includeInactive = false) => new T[0];
  }
}

// --- world scripts ---
namespace UnityEngine {
  public struct Vector2 {
    public float x, y; public Vector2(float x, float y){this.x=x;this.y=y;}
    public static Vector2 zero => default;
    public float magnitude => (float)System.Math.Sqrt(x*x+y*y);
    public Vector2 normalized { get { var m = magnitude; return m < 1e-9f ? this : new Vector2(x/m, y/m); } }
    public float sqrMagnitude => x*x+y*y;
    public static Vector2 operator *(Vector2 a, float f) => new Vector2(a.x*f, a.y*f);
    public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x-b.x, a.y-b.y);
  }
  /// Enough Bounds for the map's zoom clamp: a centre, a size, and the
  /// default-constructed zero-size case the clamp treats as "world unknown".
  public struct Bounds {
    public Vector3 center; public Vector3 size;
    public Bounds(Vector3 c, Vector3 s) { center = c; size = s; }
    public Vector3 extents => new Vector3(size.x * 0.5f, size.y * 0.5f, size.z * 0.5f);
  }

  public struct Vector3 {
    public static Vector3 zero => default;
    public static Vector3 up => default;
    public static Vector3 down => new Vector3(0f,-1f,0f);
    public static Vector3 forward => new Vector3(0f,0f,1f);
    public static Vector3 right => new Vector3(1f,0f,0f);
    public void Normalize() { var m = magnitude; if (m > 1e-9f) { x/=m; y/=m; z/=m; } }
    public float magnitude => (float)System.Math.Sqrt(x*x+y*y+z*z);
    public static Vector3 Lerp(Vector3 a, Vector3 b, float t) => a + (b - a) * Mathf.Clamp01(t);
    public float x, y, z; public Vector3(float x,float y,float z){this.x=x;this.y=y;this.z=z;}
    public float sqrMagnitude => x*x+y*y+z*z;
    public Vector3 normalized { get { var m = magnitude; return m < 1e-9f ? this : new Vector3(x/m, y/m, z/m); } }
    public static Vector3 operator /(Vector3 a, float f) => new Vector3(a.x/f, a.y/f, a.z/f);
    public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x+b.x,a.y+b.y,a.z+b.z);
    public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x-b.x,a.y-b.y,a.z-b.z);
    public static Vector3 operator *(Vector3 a, float f) => new Vector3(a.x*f,a.y*f,a.z*f);
    public static Vector3 operator -(Vector3 a) => new Vector3(-a.x,-a.y,-a.z);
    // Real, because a check that derives a triangle's facing from its vertex
    // order is worthless if the cross product returns zero. Same trap as Sqrt.
    public static Vector3 Cross(Vector3 a, Vector3 b) =>
      new Vector3(a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x);
    public static float Dot(Vector3 a, Vector3 b) => a.x*b.x + a.y*b.y + a.z*b.z;
  }
  public struct Vector2Int {
    public int x, y; public Vector2Int(int x,int y){this.x=x;this.y=y;}
    public static bool operator ==(Vector2Int a, Vector2Int b) => a.x==b.x && a.y==b.y;
    public static bool operator !=(Vector2Int a, Vector2Int b) => !(a==b);
    public override bool Equals(object o) => o is Vector2Int v && v==this;
    public override int GetHashCode() => x*397 ^ y;
  }
  public struct Quaternion {
    public static Quaternion Euler(float x,float y,float z) => default;
    public static Quaternion identity => default;
    public Vector3 eulerAngles => default;
    // Rotating a vector. Returns the vector unchanged, which is wrong as maths
    // and right as a stub: nothing here is executed, only type-checked.
    public static Vector3 operator *(Quaternion q, Vector3 v) => v;
    public static Quaternion operator *(Quaternion a, Quaternion b) => a;
  }
  public struct Color {
    public float r, g, b, a;
    public Color(float r,float g,float b){this.r=r;this.g=g;this.b=b;this.a=1f;}
    public Color(float r,float g,float b,float a){this.r=r;this.g=g;this.b=b;this.a=a;}
    public static Color white => new Color(1f,1f,1f);
    public static Color green => new Color(0f,1f,0f);
    public static Color red => new Color(1f,0f,0f);
    public static Color Lerp(Color a, Color b, float t) => a;
    public static Color operator *(Color a, Color b) => a;
    public static Color black => new Color(0f,0f,0f);
    public static Color operator *(Color c, float f) => c;
  }
  // These used to be shaped like stubs -- Sqrt returning its argument, and
  // FloorToInt truncating toward zero, which is a DIFFERENT number from floor
  // for anything negative, and half of Lincoln is at negative coordinates.
  // Fine while nothing ran, and a trap the moment something did. They are real
  // now, so logic compiled against them can also be executed against them.
  public static class Mathf {
    public static float Sqrt(float f) => (float)System.Math.Sqrt(f);
    public static float Exp(float f) => (float)System.Math.Exp(f);
    public static float Sign(float f) => f < 0f ? -1f : 1f;
    public const float Deg2Rad = 0.0174533f, Rad2Deg = 57.2958f;
    public static int FloorToInt(float f) => (int)System.Math.Floor(f);
    public static int RoundToInt(float f) => (int)System.Math.Round(f);
    public static float Abs(float f) => f < 0 ? -f : f;
    public static int Abs(int i) => i < 0 ? -i : i;
    public static float Clamp(float v,float a,float b) => v<a?a:(v>b?b:v);
    public static int Clamp(int v,int a,int b) => v<a?a:(v>b?b:v);
    public static float Clamp01(float v) => Clamp(v,0f,1f);
    public static float Max(float a,float b) => a>b?a:b;
    public static float Min(float a,float b) => a<b?a:b;
    public static int Max(int a,int b) => a>b?a:b;
    public static int Min(int a,int b) => a<b?a:b;
    public static float Sin(float f) => (float)System.Math.Sin(f);
    public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
    public static float Cos(float f) => (float)System.Math.Cos(f);
    public static float Atan2(float y, float x) => (float)System.Math.Atan2(y, x);
    public static float PI => (float)System.Math.PI;
    public static float MaxValue => float.MaxValue;
  }
  public class Mesh : Object {
    public string name; public Vector3[] vertices { get; set; } public Vector2[] uv { get; set; }
    public int[] triangles { get; set; } public Rendering.IndexFormat indexFormat { get; set; }
    public void RecalculateNormals() {} public void RecalculateBounds() {}
    public void SetVertices(System.Collections.Generic.List<Vector3> v) {}
    public void SetNormals(System.Collections.Generic.List<Vector3> v) {}
    public void SetUVs(int c, System.Collections.Generic.List<Vector2> v) {}
    public void SetColors(System.Collections.Generic.List<Color> v) {}
    public void SetTriangles(System.Collections.Generic.List<int> t, int sub) {}
  }
  namespace Rendering { public enum IndexFormat { UInt16, UInt32 } public enum AmbientMode { Skybox, Trilight, Flat, Custom } }
  public class Transform : Component {
    public T GetComponent<T>() where T : Component, new() => new T();
    public Vector3 position { get; set; } public Quaternion rotation { get; set; }
    public Vector3 localPosition { get; set; } public Quaternion localRotation { get; set; }
    public Vector3 eulerAngles { get; set; }
    public string name { get; set; }
    public int childCount => 0;
    public Transform GetChild(int i) => null;
    public void SetParent(Transform p, bool w) {}
    public Vector3 TransformDirection(Vector3 v) => v;
    public Transform parent => null;
    public Vector3 forward => default;
  }
  public class Camera : Component {
    public static Camera main => null; public Transform transform => null;
    public float farClipPlane { get; set; } public float nearClipPlane { get; set; }
    public bool orthographic { get; set; } public float orthographicSize { get; set; }
    public CameraClearFlags clearFlags { get; set; } public Color backgroundColor { get; set; }
    public float depth { get; set; } public int cullingMask { get; set; }
    public RenderTexture targetTexture { get; set; }
  }
  public enum LightType { Directional, Point, Spot }
  public enum LightShadows { None, Hard, Soft }
  public enum FogMode { Linear, Exponential, ExponentialSquared }
  public enum FindObjectsSortMode { None, InstanceID }
  public static class RenderSettings {
    public static bool fog { get; set; }
    public static FogMode fogMode { get; set; }
    public static Color fogColor { get; set; }
    public static float fogDensity { get; set; }
    public static Rendering.AmbientMode ambientMode { get; set; }
    public static Light sun { get; set; }
    public static Color ambientSkyColor { get; set; }
    public static Color ambientEquatorColor { get; set; }
    public static Color ambientGroundColor { get; set; }
    public static Material skybox { get; set; }
  }
  public class RangeAttribute : Attribute { public RangeAttribute(float a, float b) {} }
  public class Light : Component {
    public LightType type { get; set; } public float intensity { get; set; }
    public Color color { get; set; } public LightShadows shadows { get; set; }
    public Transform transform => null;
  }
  public class MeshFilter : Component { public Mesh sharedMesh { get; set; } }
  public class Renderer : Component { public bool enabled { get; set; } public Material sharedMaterial { get; set; } public Material material { get; set; } }
  public class MeshRenderer : Renderer { }
  public class SkinnedMeshRenderer : Renderer { public Transform rootBone { get; set; } public Mesh sharedMesh { get; set; } public int bones => 0; }
  public class Avatar : Object { public bool isHuman => false; public bool isValid => false; }
  public class Animator : Component {
    public Avatar avatar { get; set; }
    public bool isHuman => false;
    public RuntimeAnimatorController runtimeAnimatorController { get; set; }
    public void SetFloat(string name, float v) {}
    public void SetBool(string name, bool v) {}
    public void SetTrigger(string name) {}
    public bool applyRootMotion { get; set; }
  }
  public class RuntimeAnimatorController : Object {}
  public class MeshCollider : Component { public bool convex { get; set; } public Mesh sharedMesh { get; set; } }
  public class Material : Object {
    public void SetTexture(string n, Texture t) { }
    public Material(Shader s) {}
    public string name { get; set; }
    public Color color { get; set; }
    public Shader shader { get; set; }
    public bool HasProperty(string n) => false;
    public void SetColor(string n, Color c) {}
    public void SetFloat(string n, float f) {}
    public Texture mainTexture { get; set; }
    public void EnableKeyword(string k) {}
    public static implicit operator bool(Material m) => false;
  }
  public class Shader : Object { public static Shader Find(string n) => null; public string name { get; set; } }
  public static class Input {
    public static bool GetMouseButton(int b) => false;
    public static bool GetKey(KeyCode k) => false;
    public static float GetAxis(string n) => 0f;
    public static float GetAxisRaw(string n) => 0f;
  }
  public enum KeyCode { E, Q, LeftShift }
  public static class Time { public static float deltaTime => 0f; public static float time => 0f; public static float timeScale { get; set; } public static float unscaledDeltaTime => 0f; }
  public class CharacterController : Component {
    public bool enabled { get; set; } public float height { get; set; }
    public Vector3 center { get; set; }
    public float radius { get; set; }
    public float slopeLimit { get; set; }
    public float stepOffset { get; set; }
    public float skinWidth { get; set; }
    public float minMoveDistance { get; set; }
    public Vector3 velocity => default;
    public bool isGrounded => false;
    public CollisionFlags Move(Vector3 motion) => CollisionFlags.None;
  }
  public enum CollisionFlags { None = 0, Sides = 1, Above = 2, Below = 4 }
  public class Rigidbody : Component {
    public bool isKinematic { get; set; } public Vector3 linearVelocity { get; set; }
  }
  public class RequireComponentAttribute : System.Attribute { public RequireComponentAttribute(System.Type t) {} }

  // --- enough of the UI and camera surface for the map to be type-checked ---
  // Signatures copied from the real API. Where one is wrong the check is worse
  // than useless, so these stay mechanical: no logic, no invented overloads.
  public class Texture : Object {
    public string name { get; set; }
    public TextureWrapMode wrapMode { get; set; }
    public FilterMode filterMode { get; set; }
    public int anisoLevel { get; set; }
  }
  public enum TextureWrapMode { Repeat, Clamp, Mirror }
  public enum TextureFormat { RGBA32, RGB24 }
  public struct Color32 {
    public byte r, g, b, a;
    public Color32(byte r, byte g, byte b, byte a) { this.r=r; this.g=g; this.b=b; this.a=a; }
    public static implicit operator Color32(Color c) =>
      new Color32((byte)(c.r*255), (byte)(c.g*255), (byte)(c.b*255), (byte)(c.a*255));
  }
  public class Texture2D : Texture {
    public Texture2D(int w, int h, TextureFormat f, bool mips) {}
    public Texture2D(int w, int h, TextureFormat f, bool mips, bool linear) {}
    public void SetPixels32(Color32[] px) {}
    public void Apply(bool mips, bool noLongerReadable) {}
  }
  public enum CameraClearFlags { Skybox, SolidColor, Depth, Nothing }
  public enum FilterMode { Point, Bilinear, Trilinear }
  public enum RenderMode { ScreenSpaceOverlay, ScreenSpaceCamera, WorldSpace }
  public enum TextAnchor { UpperLeft, UpperCenter, UpperRight, MiddleLeft, MiddleCenter,
                           MiddleRight, LowerLeft, LowerCenter, LowerRight }
  public class RenderTexture : Texture {
    public RenderTexture(int w, int h, int depth) {}
    public string name { get; set; }
    public FilterMode filterMode { get; set; }
    public void Release() {}
    public static implicit operator bool(RenderTexture t) => false;
  }
  public class Font : Object {}
  public static class Resources { public static T GetBuiltinResource<T>(string path) where T : Object, new() => new T(); }
  public static class Screen { public static int width => 0; public static int height => 0; }
  public enum CursorLockMode { None, Locked, Confined }
  public static class Cursor {
    public static CursorLockMode lockState { get; set; }
    public static bool visible { get; set; }
  }
  public struct LayerMask {
    public static int NameToLayer(string n) => -1;
    public static implicit operator int(LayerMask m) => 0;
    public static implicit operator LayerMask(int v) => default;
  }
  public struct RaycastHit { public Vector3 normal; public float distance; public Vector3 point; }
  public enum QueryTriggerInteraction { UseGlobal, Ignore, Collide }
  public static class Physics {
    public static bool Raycast(Vector3 o, Vector3 d, out RaycastHit hit, float max, int mask, QueryTriggerInteraction q)
      { hit = default; return false; }
    public static bool SphereCast(Vector3 o, float r, Vector3 d, out RaycastHit hit, float max, int mask, QueryTriggerInteraction q)
      { hit = default; return false; }
    public static bool CheckSphere(Vector3 p, float r, int mask, QueryTriggerInteraction q) => false;
  }

  // Editor-only drawing. Present so OnDrawGizmosSelected type-checks; a stub
  // that drew anything would be pretending to be an editor.
  public static class Gizmos {
    public static Color color { get; set; }
    public static void DrawWireSphere(Vector3 centre, float radius) {}
    public static void DrawRay(Vector3 from, Vector3 direction) {}
    public static void DrawLine(Vector3 a, Vector3 b) {}
  }
  public struct Rect {
    public float width, height;
    public bool Contains(Vector2 p) => false;
  }
  public class RectTransform : Transform {
    public Vector2 anchorMin { get; set; } public Vector2 anchorMax { get; set; }
    public Vector2 pivot { get; set; } public Vector2 sizeDelta { get; set; }
    public Vector2 anchoredPosition { get; set; }
    public Rect rect => default;
  }
  public static class RectTransformUtility {
    public static bool RectangleContainsScreenPoint(RectTransform r, Vector2 p, Camera c) => false;
    public static bool ScreenPointToLocalPointInRectangle(RectTransform r, Vector2 p, Camera c, out Vector2 local) { local = default; return false; }
  }
  public class LineRenderer : Component {
    public int positionCount { get; set; }
    public float startWidth { get; set; } public float endWidth { get; set; }
    public bool useWorldSpace { get; set; } public int numCapVertices { get; set; }
    public Material material { get; set; }
    public void SetPosition(int i, Vector3 p) {}
  }
  public class Canvas : Component { public RenderMode renderMode { get; set; } }
  public class CanvasScaler : Component {
    public enum ScaleMode { ConstantPixelSize, ScaleWithScreenSize, ConstantPhysicalSize }
    public ScaleMode uiScaleMode { get; set; }
    public Vector2 referenceResolution { get; set; }
  }
}

// WHAT THESE STUBS DO NOT CHECK
//
// They model the C# language and say NOTHING about Unity's assembly graph. A
// stub is visible to every file in the csproj regardless of which Unity
// assembly really provides the type, so "does this type exist" always answers
// yes -- which is how TrapPostProcess passed here and put real Unity into Safe
// Mode for want of two asmdef references.
//
// `npm run check:assemblies` is what checks that, against the real packages on
// disk. Adding a stub here is not enough on its own; the assembly that declares
// the real type has to be referenced too.
//
// Enough URP for TrapPostProcess to compile. The real types live in the
// com.unity.render-pipelines.universal package, which is not on disk here --
// this checks the SHAPE of the call, which is where the mistakes are (a
// VolumeParameter set without its overrideState does nothing at all, silently).
namespace UnityEngine {
  public class ScriptableObject : Object { public string name { get; set; } public static T CreateInstance<T>() where T : ScriptableObject, new() => new T(); }
}
namespace UnityEngine.Rendering {
  public class VolumeProfile : ScriptableObject { public T Add<T>(bool overrides) where T : VolumeComponent, new() => new T(); }
  public class VolumeComponent : ScriptableObject { }
  public class VolumeParameter<T> { public bool overrideState; public T value; }
  public class Volume : MonoBehaviour { public bool isGlobal; public float priority; public VolumeProfile profile; }
}
namespace UnityEngine.Rendering.Universal {
  public enum TonemappingMode { None, Neutral, ACES }
  public class Tonemapping : VolumeComponent { public VolumeParameter<TonemappingMode> mode = new VolumeParameter<TonemappingMode>(); }
}

namespace UnityEngine.UI {
  public class Graphic : Component { public Color color { get; set; } }
  public class RawImage : Graphic { public Texture texture { get; set; } }
  // RenderTexture derives from Texture in the real API, which is what lets a
  // RawImage show a camera's output at all.
  public class Image : Graphic {}
  public class Text : Graphic {
    public Font font { get; set; } public int fontSize { get; set; }
    public string text { get; set; } public TextAnchor alignment { get; set; }
  }
}
// The new Input System, which this project uses (activeInputHandler: 1).
// Stubbed so the ENABLE_INPUT_SYSTEM branch of FlyCamera is actually compiled
// rather than skipped — the legacy branch compiling proves nothing about the
// one that runs.
namespace UnityEngine.InputSystem {
  public class ButtonControl { public bool isPressed => false; public bool wasPressedThisFrame => false; }

  // Actions, for the owned player controller. The controller resolves these by
  // name from the project-wide asset, so the stub only has to prove the calls
  // are well typed -- it never returns an action and nothing ever fires.
  public class InputDevice {}
  public class InputControl { public InputDevice device => null; }
  public class InputAction {
    public T ReadValue<T>() => default(T);
    public bool IsPressed() => false;
    public bool WasPressedThisFrame() => false;
    public bool WasReleasedThisFrame() => false;
    public InputControl activeControl => null;
    public void Enable() {}
    public void Disable() {}
  }
  public class InputActionMap {
    public InputAction FindAction(string name, bool throwIfNotFound = false) => null;
    public void Enable() {}
    public void Disable() {}
  }
  public class InputActionAsset : UnityEngine.Object {
    public InputActionMap FindActionMap(string name, bool throwIfNotFound = false) => null;
    public InputAction FindAction(string name, bool throwIfNotFound = false) => null;
    public void Enable() {}
  }
  public static class InputSystem { public static InputActionAsset actions => null; }
  public class Vector2Control { public Vector2 ReadValue() => default; }
  public class Mouse : InputDevice {
    public static Mouse current => null;
    public ButtonControl rightButton => null;
    public ButtonControl leftButton => null;
    public Vector2Control delta => null;
    public Vector2Control position => null;
    public Vector2Control scroll => null;
  }
  public class Keyboard : InputDevice {
    public static Keyboard current => null;
    public ButtonControl wKey => null;
    public ButtonControl aKey => null;
    public ButtonControl sKey => null;
    public ButtonControl dKey => null;
    public ButtonControl qKey => null;
    public ButtonControl eKey => null;
    public ButtonControl leftShiftKey => null;
    public ButtonControl spaceKey => null;
    public ButtonControl mKey => null;
    public ButtonControl leftBracketKey => null;
    public ButtonControl rightBracketKey => null;
    public ButtonControl escapeKey => null;
    public ButtonControl tabKey => null;
    public ButtonControl enterKey => null;
    // The rest of the alphabet, so adding a shortcut does not also mean
    // editing this file and discovering why CI went red.
    public ButtonControl bKey => null;
    public ButtonControl cKey => null;
    public ButtonControl fKey => null;
    public ButtonControl gKey => null;
    public ButtonControl hKey => null;
    public ButtonControl iKey => null;
    public ButtonControl jKey => null;
    public ButtonControl kKey => null;
    public ButtonControl lKey => null;
    public ButtonControl nKey => null;
    public ButtonControl oKey => null;
    public ButtonControl pKey => null;
    public ButtonControl rKey => null;
    public ButtonControl tKey => null;
    public ButtonControl uKey => null;
    public ButtonControl vKey => null;
    public ButtonControl xKey => null;
    public ButtonControl yKey => null;
    public ButtonControl zKey => null;
  }
}
namespace UnityEngine.SceneManagement {
  public static class SceneManager { public static void LoadScene(string name) {} }
}
namespace UnityEngine.Networking {
  public class DownloadHandler { public string text => ""; }
  public class DownloadHandlerBuffer : DownloadHandler {}
  public class UploadHandler {}
  public class UploadHandlerRaw : UploadHandler { public UploadHandlerRaw(byte[] b) {} }
  public class UnityWebRequestAsyncOperation {}
  public class UnityWebRequest : IDisposable {
    public enum Result { Success, ConnectionError, ProtocolError, DataProcessingError }
    public const string kHttpVerbPOST = "POST";
    public const string kHttpVerbGET = "GET";
    public const string kHttpVerbPUT = "PUT";
    public const string kHttpVerbDELETE = "DELETE";
    public const string kHttpVerbHEAD = "HEAD";
    public static string EscapeURL(string s) => s;
    public UnityWebRequest(string url, string verb) {}
    public static UnityWebRequest Get(string url) => new UnityWebRequest(url, "GET");
    public string error => null;
    public UploadHandler uploadHandler { get; set; }
    public DownloadHandler downloadHandler { get; set; }
    public Result result => Result.Success;
    public long responseCode => 200;
    public void SetRequestHeader(string n, string v) {}
    public UnityWebRequestAsyncOperation SendWebRequest() => null;
    public void Dispose() {}
  }
}
