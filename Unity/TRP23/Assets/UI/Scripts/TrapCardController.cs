using System;
using UnityEngine.UIElements;
using TrapMadeIt.CaseFile;

namespace TrapMadeIt.UI
{
    /// <summary>
    /// Drives the trap card inside the case file panel.
    ///
    /// The card is the one thing on the case file the player writes themselves
    /// (Chapter 01) and is handed back to them in the final chapter. Two rules
    /// it must never break, both of which are the reason it exists:
    ///
    ///   - It is NEVER scored. "It still holds me" is an honest answer and the
    ///     game says so. The moment it scores, it stops being a mirror and
    ///     becomes a test.
    ///   - It cannot be edited in the final chapter. Offering an input there
    ///     would let a player quietly rewrite their statement before being
    ///     asked about it, which destroys the only moment this exists for.
    ///     TrapCardState.For enforces that; this class only draws what it says.
    ///
    /// Which state to draw is decided by TrapCardState, shared with the web
    /// build through src/data/trapCard.cases.json. Do not re-decide it here.
    /// </summary>
    public class TrapCardController
    {
        readonly VisualElement _root;
        readonly CaseFileService _service;

        string _statement = "";
        string _answer;
        bool _loaded;

        public TrapCardController(VisualElement root, CaseFileService service)
        {
            _root = root;
            _service = service;

            // Wired defensively. Q returns null for a name that is not in the
            // UXML, and a NullReferenceException in here would take the whole
            // HUD down with it — store, bank and account included — over one
            // renamed element.
            Bind("trap-save", OnSave);
            Bind("trap-freed", () => OnAnswer("freed"));
            Bind("trap-holds", () => OnAnswer("holds"));
        }

        T Q<T>(string name) where T : VisualElement => _root.Q<T>(name);

        void Bind(string name, Action handler)
        {
            var button = Q<Button>(name);
            if (button != null) button.clicked += handler;
        }

        /// <summary>Open the panel: fetch once, then draw for the current chapter.</summary>
        public void Show(int level, int lastLevel)
        {
            if (_loaded) { Render(level, lastLevel); return; }
            Msg("");
            _service.Fetch(r =>
            {
                if (r.ok)
                {
                    _statement = r.trapStatement ?? "";
                    _answer = r.trapAnswer;
                    _loaded = true;
                }
                else
                {
                    // Say why rather than showing a confident blank card, which
                    // would invite the player to write it a second time.
                    Msg(r.error ?? "could not open your case file", "err");
                }
                Render(level, lastLevel);
            });
        }

        void OnSave()
        {
            var text = Q<TextField>("trap-input").value;
            _service.SaveStatement(text, r =>
            {
                if (!r.ok) { Msg(r.error, "err"); return; }
                _statement = r.trapStatement ?? "";
                Msg("it's on the board — it stays there");
                Render(_level, _lastLevel);
            });
        }

        void OnAnswer(string answer)
        {
            _service.SaveAnswer(answer, r =>
            {
                if (!r.ok) { Msg(r.error, "err"); return; }
                _answer = r.trapAnswer;
                // Neither answer is a win or a loss, and the wording says so.
                Msg(_answer == "freed" ? "that's the whole point — keep going"
                                       : "still honest — that counts too");
                Render(_level, _lastLevel);
            });
        }

        int _level, _lastLevel;

        void Render(int level, int lastLevel)
        {
            _level = level;
            _lastLevel = lastLevel;

            var view = TrapCardState.For(level, lastLevel, _statement, _answer);
            var card = Q<VisualElement>("trap-card");
            var write = Q<VisualElement>("trap-write");
            var read = Q<VisualElement>("trap-read");
            var ask = Q<VisualElement>("trap-ask");

            if (view == TrapCardState.Hidden)
            {
                Show(card, false);
                return;
            }
            Show(card, true);

            var writing = view == TrapCardState.Write || view == TrapCardState.Edit;
            Show(write, writing);
            Show(read, !writing);
            Show(ask, view == TrapCardState.Ask);

            var question = Q<Label>("trap-question");
            var note = Q<Label>("trap-note");

            if (writing)
            {
                if (question != null) question.text = "WHAT'S TRAPPING ME";
                var input = Q<TextField>("trap-input");
                if (input != null) input.value = _statement;
                var save = Q<Button>("trap-save");
                if (save != null) save.text = view == TrapCardState.Edit
                    ? "CHANGE IT" : "PUT IT ON THE BOARD";
                return;
            }

            var said = Q<Label>("trap-said");
            if (said != null) said.text = _statement;
            if (question == null || note == null) return;

            switch (view)
            {
                case TrapCardState.Ask:
                    question.text = "YOU WROTE THIS IN CHAPTER 01";
                    note.text = "";
                    break;
                case TrapCardState.Answered:
                    question.text = "WHAT WAS TRAPPING YOU";
                    note.text = _answer == "freed"
                        ? "You said it does not hold you any more."
                        : "You said it still holds you. That is worth knowing.";
                    break;
                default: // Locked
                    question.text = "WHAT'S TRAPPING ME";
                    note.text = "In your words, Chapter 01.";
                    break;
            }
        }

        static void Show(VisualElement e, bool visible)
        {
            if (e == null) return;
            e.EnableInClassList("hidden", !visible);
        }

        void Msg(string text, string kind = null)
        {
            var el = Q<Label>("trap-msg");
            if (el == null) return;
            el.text = text ?? "";
            el.EnableInClassList("err", kind == "err");
        }
    }
}
