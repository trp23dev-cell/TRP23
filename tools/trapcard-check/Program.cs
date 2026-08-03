// ============================================================================
// Runs the SHARED trap-card table against the C# state machine Unity ships.
//
// The table lives in src/data/trapCard.cases.json and is the same one the web
// build is checked against, so the two clients cannot quietly disagree about
// when the card appears or whether it can still be edited.
//
// Invoked by `npm run check:trap`. Parses the JSON by hand: this project
// deliberately has no package references, so that a checkout with nothing but
// the .NET SDK can still run it.
// ============================================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using TrapMadeIt.CaseFile;

static class Program
{
    static int failures = 0;

    static void Check(string name, string actual, string expected)
    {
        var ok = actual == expected;
        Console.WriteLine(ok
            ? $"  ok  {name}"
            : $"FAIL  {name} — got {Show(actual)}, wanted {Show(expected)}");
        if (!ok) failures++;
    }

    static string Show(string v) => v == null ? "null" : $"\"{v}\"";

    /// JsonElement -> string, keeping the JSON null/string distinction that the
    /// answer normaliser turns on.
    static string Str(JsonElement e, string prop)
    {
        if (!e.TryGetProperty(prop, out var v)) return null;
        return v.ValueKind == JsonValueKind.Null ? null : v.GetString();
    }

    static int Main()
    {
        // tools/trapcard-check/bin/<cfg>/<tfm>/ -> repo root
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var casesPath = Path.Combine(root, "src", "data", "trapCard.cases.json");
        if (!File.Exists(casesPath))
        {
            Console.Error.WriteLine($"cannot find the shared table at {casesPath}");
            return 1;
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(casesPath));
        var r = doc.RootElement;
        var lastLevel = r.GetProperty("lastLevel").GetInt32();

        foreach (var c in r.GetProperty("states").EnumerateArray())
        {
            Check(c.GetProperty("name").GetString(),
                TrapCardState.For(
                    c.GetProperty("level").GetInt32(),
                    lastLevel,
                    Str(c, "statement"),
                    Str(c, "answer")),
                Str(c, "expect"));
        }

        foreach (var c in r.GetProperty("statements").EnumerateArray())
            Check(c.GetProperty("name").GetString(), TrapCardState.Normalise(Str(c, "in")), Str(c, "expect"));

        foreach (var c in r.GetProperty("answers").EnumerateArray())
            Check(c.GetProperty("name").GetString(), TrapCardState.NormaliseAnswer(Str(c, "in")), Str(c, "expect"));

        Check($"statements are capped at {TrapCardState.TrapMax}",
            TrapCardState.Normalise(new string('x', 500)).Length.ToString(),
            TrapCardState.TrapMax.ToString());

        return failures == 0 ? 0 : 1;
    }
}
