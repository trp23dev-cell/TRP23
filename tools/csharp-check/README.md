# C# check

Type-checks the Unity scripts without opening the editor.

```bash
npm run check:csharp
```

`UnityStubs.cs` holds minimal stand-ins for the Unity APIs the scripts touch —
`MonoBehaviour`, `PlayerPrefs`, `JsonUtility`, `UnityWebRequest` and so on. It is
not a Unity emulator and does not run anything; it exists so the compiler can
prove the code is valid before it reaches the editor.

The alternative is finding out from a red console after a project import, which
is a slow way to discover a missing semicolon. It will not catch anything that
depends on real Unity behaviour — only that the code compiles.

Add a file to `check.csproj` when it needs covering. Scripts that use large
parts of the engine are not worth stubbing; leave those to the editor.
