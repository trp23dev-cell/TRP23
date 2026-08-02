// Minimal stand-ins for the Unity APIs the auth scripts touch, so the C# can be
// type-checked without the editor. Not a Unity emulator — just enough surface
// for the compiler to prove the code is valid.
using System;
using System.Collections;
namespace UnityEngine {
  public class Object {}
  public class MonoBehaviour : Component { public Coroutine StartCoroutine(IEnumerator r) => null; public static void DontDestroyOnLoad(Object o) {} public static void Destroy(Object o) {} }
  public class Coroutine {}
  public static class PlayerPrefs {
    public static string GetString(string k, string d) => d;
    public static void SetString(string k, string v) {}
    public static void DeleteKey(string k) {}
    public static void Save() {}
  }
  public static class Debug { public static void LogWarning(object m) {} public static void Log(object m) {} }
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
    public T AddComponent<T>() where T : Component, new() => new T();
  }
  public class Component : Object { public GameObject gameObject => null; }
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
    public UploadHandler uploadHandler { get; set; }
    public DownloadHandler downloadHandler { get; set; }
    public Result result => Result.Success;
    public long responseCode => 200;
    public void SetRequestHeader(string n, string v) {}
    public UnityWebRequestAsyncOperation SendWebRequest() => null;
    public void Dispose() {}
  }
}
