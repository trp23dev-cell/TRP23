namespace TrapMadeIt.CaseFile
{
    /// <summary>
    /// The trap card's five states — the C# twin of src/data/trapCard.js.
    ///
    /// The card is the one thing on the case file the player writes themselves
    /// (Chapter 01) and is handed back to them in the final chapter. It is
    /// never scored.
    ///
    /// TWO IMPLEMENTATIONS, ONE TABLE. This logic exists in JavaScript as well,
    /// because the web build still runs it, and hand-transcribed rules between
    /// the two clients are exactly how contracts drift apart (see the audit,
    /// D9 — Unity's MockAuthService re-typed the web's signup regex by hand).
    /// So neither copy owns the truth: both are checked against the same shared
    /// table in src/data/trapCard.cases.json.
    ///
    ///   npm run check:trap     runs the table against BOTH
    /// </summary>
    public static class TrapCardState
    {
        /// <summary>Longest statement we store. Long enough to be honest, short enough to fit.</summary>
        public const int TrapMax = 180;

        public const string Hidden = "hidden";     // not written, and not where you write it
        public const string Write = "write";       // Chapter 01, blank card with an input
        public const string Edit = "edit";         // Chapter 01, written, still changeable
        public const string Locked = "locked";     // middle chapters — on the board, fixed
        public const string Ask = "ask";           // final chapter, the question
        public const string Answered = "answered"; // final chapter, already answered

        /// <summary>
        /// Which card to draw. The drawing is UI work and can only really be
        /// judged by looking at it; this part is a decision with exactly five
        /// outcomes and is tested without an editor.
        /// </summary>
        public static string For(int level, int lastLevel, string statement, string answer)
        {
            var written = !string.IsNullOrEmpty(Normalise(statement));
            var onFirst = level == 0;
            var onLast = level == lastLevel;

            if (onFirst) return written ? Edit : Write;
            if (!written) return Hidden;
            // Deliberately BEFORE any edit path: offering an input in the
            // chapter that asks about the statement would let a player quietly
            // rewrite it first, which destroys the only moment this exists for.
            if (onLast) return string.IsNullOrEmpty(NormaliseAnswer(answer)) ? Ask : Answered;
            return Locked;
        }

        /// <summary>Trim and cap a statement on its way to being stored.</summary>
        public static string Normalise(string text)
        {
            if (text == null) return "";
            var trimmed = text.Trim();
            return trimmed.Length > TrapMax ? trimmed.Substring(0, TrapMax) : trimmed;
        }

        /// <summary>Only these two answers exist. Anything else is "not answered yet".</summary>
        public static string NormaliseAnswer(string answer)
        {
            return answer == "holds" || answer == "freed" ? answer : null;
        }
    }
}
