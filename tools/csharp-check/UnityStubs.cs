// Minimal stand-ins for the Unity APIs the auth scripts touch, so the C# can be
// type-checked without the editor. Not a Unity emulator — just enough surface
// for the compiler to prove the code is valid.
using System;
using System.Collections;
namespace UnityEngine {
  public class Object {}
  public class MonoBehaviour : Component { public Transform transform => null; public Coroutine StartCoroutine(IEnumerator r) => null; public static void DontDestroyOnLoad(Object o) {} public static void Destroy(Object o) {} }
  public class Coroutine {}
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
  public class SerializeFieldAttribute : Attribute {}
  public class GameObject : Object {
    public GameObject() {}
    public GameObject(string name) {}
    public string tag { get; set; }
    public Transform transform => null;
    public T AddComponent<T>() where T : Component, new() => new T();
  }
  public class Component : Object { public GameObject gameObject => null; public T GetComponent<T>() where T : Component, new() => new T(); }
}

// --- world scripts ---
namespace UnityEngine {
  public struct Vector2 { public float x, y; public Vector2(float x, float y){this.x=x;this.y=y;} }
  public struct Vector3 {
    public static Vector3 zero => default;
    public static Vector3 up => default;
    public float x, y, z; public Vector3(float x,float y,float z){this.x=x;this.y=y;this.z=z;}
    public float sqrMagnitude => x*x+y*y+z*z;
    public Vector3 normalized => this;
    public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x+b.x,a.y+b.y,a.z+b.z);
    public static Vector3 operator *(Vector3 a, float f) => new Vector3(a.x*f,a.y*f,a.z*f);
  }
  public struct Vector2Int {
    public int x, y; public Vector2Int(int x,int y){this.x=x;this.y=y;}
    public static bool operator ==(Vector2Int a, Vector2Int b) => a.x==b.x && a.y==b.y;
    public static bool operator !=(Vector2Int a, Vector2Int b) => !(a==b);
    public override bool Equals(object o) => o is Vector2Int v && v==this;
    public override int GetHashCode() => x*397 ^ y;
  }
  public struct Quaternion { public static Quaternion Euler(float x,float y,float z) => default; public Vector3 eulerAngles => default; }
  public struct Color {
    public Color(float r,float g,float b){}
    public static Color operator *(Color c, float f) => c;
  }
  public static class Mathf {
    public static float Sqrt(float f) => f;
    public const float Deg2Rad = 0.0174533f, Rad2Deg = 57.2958f;
    public static int FloorToInt(float f) => (int)f;
    public static float Abs(float f) => f < 0 ? -f : f;
    public static int Abs(int i) => i < 0 ? -i : i;
    public static float Clamp(float v,float a,float b) => v<a?a:(v>b?b:v);
    public static int Clamp(int v,int a,int b) => v<a?a:(v>b?b:v);
    public static float Clamp01(float v) => Clamp(v,0f,1f);
    public static float Max(float a,float b) => a>b?a:b;
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
  namespace Rendering { public enum IndexFormat { UInt16, UInt32 } }
  public class Transform : Component {
    public Vector3 position { get; set; } public Quaternion rotation { get; set; }
    public void SetParent(Transform p, bool w) {}
    public Vector3 TransformDirection(Vector3 v) => v;
  }
  public class Camera : Component {
    public static Camera main => null; public Transform transform => null;
    public float farClipPlane { get; set; } public float nearClipPlane { get; set; }
  }
  public enum LightType { Directional }
  public class Light : Component { public LightType type { get; set; } public float intensity { get; set; } public Transform transform => null; }
  public class MeshFilter : Component { public Mesh sharedMesh { get; set; } }
  public class MeshRenderer : Component { public Material sharedMaterial { get; set; } }
  public class Material : Object { public Material(Shader s) {} public string name { get; set; } public Color color { get; set; } }
  public class Shader : Object { public static Shader Find(string n) => null; }
  public static class Input {
    public static bool GetMouseButton(int b) => false;
    public static bool GetKey(KeyCode k) => false;
    public static float GetAxis(string n) => 0f;
    public static float GetAxisRaw(string n) => 0f;
  }
  public enum KeyCode { E, Q, LeftShift }
  public static class Time { public static float deltaTime => 0f; }
  public class RequireComponentAttribute : System.Attribute { public RequireComponentAttribute(System.Type t) {} }
}
// The new Input System, which this project uses (activeInputHandler: 1).
// Stubbed so the ENABLE_INPUT_SYSTEM branch of FlyCamera is actually compiled
// rather than skipped — the legacy branch compiling proves nothing about the
// one that runs.
namespace UnityEngine.InputSystem {
  public class ButtonControl { public bool isPressed => false; }
  public class Vector2Control { public Vector2 ReadValue() => default; }
  public class Mouse {
    public static Mouse current => null;
    public ButtonControl rightButton => null;
    public Vector2Control delta => null;
  }
  public class Keyboard {
    public static Keyboard current => null;
    public ButtonControl wKey => null;
    public ButtonControl aKey => null;
    public ButtonControl sKey => null;
    public ButtonControl dKey => null;
    public ButtonControl qKey => null;
    public ButtonControl eKey => null;
    public ButtonControl leftShiftKey => null;
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
