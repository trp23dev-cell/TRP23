# The character adapter boundary

**Only this folder may reference UMA types.** `check:repo` fails if a `using UMA…`
or a `UMA.` reference appears anywhere else under `Assets/`.

Everything in the game talks to `ICharacterVisual`. That is what makes the
WP-U17a trial reversible: if UMA is rejected on mobile cost or because its
bundled art licensing cannot be cleared, leaving costs one adapter rather than
every file that ever touched a character.

**Currently empty, deliberately.** UMA has not been imported — see
`docs/03-technical/CHARACTER-VISUAL-PIPELINE.md`. The working implementation is
`../CapsuleCharacterVisual.cs`, which stays in the project permanently as the
no-dependency fallback.

When UMA is imported, `UmaCharacterVisual.cs` goes here and nowhere else.
