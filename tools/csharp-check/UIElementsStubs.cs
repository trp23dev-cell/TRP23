// ============================================================================
// UI TOOLKIT STUBS — just enough UIElements to compile the HUD and menu.
//
// WHY THIS EXISTS
//
// TrapHudController.cs, TrapCardController.cs and TrapMenuController.cs were
// the only runtime scripts NOT covered by check:csharp, because UnityEngine.
// UIElements was not stubbed. So the first thing ever to compile them was the
// founder's editor — which meant every UI change shipped on the hope that it
// was valid, and finding out cost somebody a project import.
//
// That is exactly backwards for the files most likely to be edited.
//
// The surface here is deliberately the surface we USE, and nothing else. It is
// not an emulation of UI Toolkit: nothing is laid out, nothing is drawn, no
// event ever fires. It answers one question — does this code compile — and a
// stub that tried to answer more would be a second implementation to keep in
// step with the first.
//
// Adding a UIElements type to a script? Add it here too, or the check quietly
// stops covering that file.
// ============================================================================

using System;
using System.Collections.Generic;

namespace UnityEngine.UIElements
{
    public enum DisplayStyle { Flex, None }
    public enum PickingMode { Position, Ignore }

    /// Real UI Toolkit wraps every style value in StyleEnum/StyleLength, which
    /// exist to carry "unset" and to accept several source types. Assignment is
    /// all we do, so implicit conversions from the underlying type are enough.
    public struct StyleEnum<T> where T : struct
    {
        public T value;
        public static implicit operator StyleEnum<T>(T v) => new StyleEnum<T> { value = v };
    }

    public struct StyleLength
    {
        public float value;
        public static implicit operator StyleLength(float v) => new StyleLength { value = v };
        public static implicit operator StyleLength(int v) => new StyleLength { value = v };
    }

    public interface IStyle
    {
        StyleEnum<DisplayStyle> display { get; set; }
        StyleLength marginTop { get; set; }
        StyleLength marginBottom { get; set; }
        StyleLength marginLeft { get; set; }
        StyleLength marginRight { get; set; }
        StyleLength width { get; set; }
        StyleLength height { get; set; }
    }

    class Style : IStyle
    {
        public StyleEnum<DisplayStyle> display { get; set; }
        public StyleLength marginTop { get; set; }
        public StyleLength marginBottom { get; set; }
        public StyleLength marginLeft { get; set; }
        public StyleLength marginRight { get; set; }
        public StyleLength width { get; set; }
        public StyleLength height { get; set; }
    }

    public class VisualElement
    {
        readonly List<VisualElement> children = new List<VisualElement>();
        readonly HashSet<string> classes = new HashSet<string>();

        public string name { get; set; }
        public IStyle style { get; } = new Style();
        public PickingMode pickingMode { get; set; }

        public void Add(VisualElement child) => children.Add(child);
        public void Clear() => children.Clear();
        public void Remove(VisualElement child) => children.Remove(child);

        public void AddToClassList(string c) => classes.Add(c);
        public void RemoveFromClassList(string c) => classes.Remove(c);
        public bool ClassListContains(string c) => classes.Contains(c);
        public void EnableInClassList(string c, bool on) { if (on) classes.Add(c); else classes.Remove(c); }
        public void ToggleInClassList(string c) { if (!classes.Remove(c)) classes.Add(c); }

        /// Returns null, always. The real one searches the tree; the point here
        /// is only that the call is well typed. Code that assumes a non-null
        /// result is why TrapCardController binds its buttons defensively.
        public T Q<T>(string name = null, string className = null) where T : VisualElement => null;
        public VisualElement Q(string name = null, string className = null) => null;

        public void SetEnabled(bool on) { }
        public bool enabledSelf { get; private set; } = true;
        public void Focus() { }
        public void MarkDirtyRepaint() { }
    }

    public class Label : VisualElement
    {
        public string text { get; set; }
        public Label() { }
        public Label(string text) { this.text = text; }
    }

    public class Button : VisualElement
    {
        public string text { get; set; }
        /// Real UI Toolkit exposes this as an event you can += and -=.
        public event Action clicked;
        public Button() { }
        public Button(Action onClick) { clicked += onClick; }
        /// Never called. Present so the compiler does not warn that `clicked`
        /// is assigned and never used.
        internal void InvokeClicked() => clicked?.Invoke();
    }

    public class TextField : VisualElement
    {
        public string value { get; set; }
        public string label { get; set; }
        public bool multiline { get; set; }
        public int maxLength { get; set; }
        public bool isPasswordField { get; set; }
        public void SetValueWithoutNotify(string v) => value = v;
    }

    public class Toggle : VisualElement
    {
        public bool value { get; set; }
        public string label { get; set; }
        public void SetValueWithoutNotify(bool v) => value = v;
    }

    public class ScrollView : VisualElement { }

    public class VisualTreeAsset : Object { }

    public class UIDocument : MonoBehaviour
    {
        public VisualElement rootVisualElement { get; set; } = new VisualElement();
        public VisualTreeAsset visualTreeAsset { get; set; }
        public PanelSettings panelSettings { get; set; }
    }

    public class PanelSettings : Object { }
}
