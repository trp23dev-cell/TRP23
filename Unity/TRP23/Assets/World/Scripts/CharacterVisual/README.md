# The character adapter boundary

**Only this folder may reference UMA types.** `check:repo` fails if a `using UMA…`
or a `UMA.` reference appears anywhere else under `Assets/`.

Everything in the game talks to `ICharacterVisual`. That is what makes the
WP-U17a trial reversible: if UMA is rejected on mobile cost or because its
bundled art licensing cannot be cleared, leaving costs one adapter rather than
every file that ever touched a character.

**UMA was evaluated and rejected — D-C01.** Not because it is defective, but
because TRP23 chose fixed archetypes (D-111, D-C02) and UMA exists for runtime
procedural bodies. See `docs/03-technical/CHARACTER-VISUAL-PIPELINE.md` §12.

The working implementation is `../CapsuleCharacterVisual.cs`. It stays until an
authored archetype body exists (D-C03), and the seam it implements is unchanged
by the framework decision — which was the point of building it first.

**The guard stays.** It now reads as a general third-party containment rule: any
character technology adopted later belongs here and nowhere else.
