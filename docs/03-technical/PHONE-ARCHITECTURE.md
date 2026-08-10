# The Phone — architecture

**Package:** WP-U15a (shell only) · **Assembly:** `TRP23.UI` · **Status:** shell built, apps pending their own packages

---

## 1 · The doctrine, because it decides the code

> **The Phone tells you. The world is where you do it.**

This is not a tone note, it is the design constraint that shapes every class here. Six apps were built and each one had a moment where it could either **do** the thing or **point at** the thing. Every one points:

| App | Could have | Does |
|---|---|---|
| Wallet | Deposit, withdraw, buy | **Shows** two balances the server reported |
| Map | Drawn its own map | **Asks** the existing map to open |
| Case File | Reimplemented the card | **Opens** the existing panel |

That is the doctrine and also the safer engineering: the Wallet app holds no money logic to get wrong, and the ledger keeps exactly one client path to it.

---

## 2 · Shape

```
TrapHudController          owns the UIDocument, drives Update, one keyboard reader
  └── PhoneController      shell: open/close, home ⇄ app, the two registers
        └── IPhoneApp ×6   each app builds a VisualElement and is told when it shows
```

`PhoneController` is **not a MonoBehaviour**, for the same reason `TrapCardController` is not: the HUD already owns the document and its lifetime, and a second component competing for the same root gives you two things enabling in an order nobody chose.

### Why an interface for six placeholders

Normally this project rejects abstractions with one implementation. This one earns its place because of what is scheduled next: Map, Messages, Missions, Drops, Contacts and Wallet are **six separate future packages**. The known failure mode for a phone UI is one controller that grows a branch per app until nothing can change without reading all of it. Splitting now costs one small file; splitting later costs a rewrite.

It is deliberately the smallest interface that achieves that — `Id`, `Title`, `Glyph`, `Build()`, `OnShow()`. No per-app navigation stack, no lifecycle, no injection. Anything more would be building a framework for apps that do not exist, which is the other way this goes wrong.

Three placeholder apps share **one** `PendingApp` class. They become their own files the moment one of them has behaviour — which is when the split starts paying for itself, and not before. **No app gets its own assembly.**

---

## 3 · Input and focus

The Phone adds **no** new pause flag, focus boolean or cursor write. It takes the holder name `"phone"` in the two existing registers:

```csharp
PointerFocus.Request("phone");   // you need a cursor to press an app
GameFreeze.Request("phone");     // the street should not carry on while you read
```

`PointerFocus` and `GameFreeze` are **named-holder sets, not counters**, so the Phone composing with a HUD panel (`"hud"`) and the map (`"map"`) works in any order — including the order where the scene is torn down with all three open. Movement and look are blocked at source: `GameplayInput` reads the freeze register and `TrapPlayerController` disables its action map, so nothing per-consumer had to be added.

**Three checks were added to `check:world`** for exactly this, because it is the failure that does not show up in a demo:

- closing the Phone and the map leaves a panel still holding
- the last of three surfaces to close is the one that restores control
- **the Phone releasing a hold it never took does not free the cursor** — `Teardown()` releases unconditionally, so this is the real path

### Escape

Escape is wanted by the Phone, the panels and the map, and must reach **exactly one**. The HUD's `Update` gives the Phone first refusal and it reports whether it consumed the key. On the Phone, Escape goes **back**, then closes.

### One surface at a time

The registers would tolerate a panel open behind the Phone, but the player would be reading a panel through a phone. So opening the Phone closes the panels, and opening a panel closes the Phone.

---

## 4 · The assembly boundary, and the one signal it needed

`TRP23.UI` **cannot reference** `TRP23.World` — WP-U01 drew that line and `check:csharp` fails if it is crossed. The Map app therefore cannot call `TrapMinimap`.

Three options, one honest: an event, a duplicate map inside the Phone, or a Map app that tells you to press M. So `Core/GameSignals.cs` carries **one** event, `OpenMapRequested`; the Phone raises it, `TrapMinimap` answers it and remains the only thing that knows how the map opens.

**This is not a general message bus.** A signal hides who is talking to whom, which is a real cost, and it is only worth paying where a direct reference is forbidden. Subscribe and unsubscribe in pairs — these are static, and a scene object that forgets keeps a dead object alive.

**A gate turned itself off and was fixed.** `tools/csharp-check/*.csproj` used non-recursive globs, so `Assets/UI/Scripts/Phone/` compiled nowhere. All three are now `**/*.cs`, and the boundary guard was re-proved by planting a `using TrapMadeIt.World;` in the new folder and confirming it fails.

---

## 5 · Presentation

Chrome in `GameHud.uxml`, every app surface built in C#, so a future package changes one class instead of editing markup six packages share.

`TrapPhone.uss` uses **only** `var()` tokens from `TrapTokens.uss`, so the Phone re-skins with the rest of the game rather than becoming a private palette someone has to find later. Icons are glyphs — replaceable by textures without touching `IPhoneApp`, and the package was explicitly not to spend its time on final branding art.

**Scaling:** the device is sized in percentages with a pixel cap, so it fills a phone screen and stops growing on a monitor. UI Toolkit has no safe-area primitive, so the outer layer carries percentage padding that a notch eats into instead of the screen. **Real per-device insets belong to WP-U04** — this does not pretend to be that.

Touch targets are ≥ 32 px and the home tiles are 54 px, so the layout is finger-safe now rather than being reworked when mobile arrives. Controller navigation is **not** wired: UI Toolkit's focus ring needs an explicit focus order to be any good, and doing it properly belongs with the gamepad package.

---

## 6 · Deliberately absent

Route planning · the final map · a messaging backend · Drop backend · contacts relationships · banking transactions · physical commerce · notifications · social · camera · app store · fake-phone simulation.

The clock reads `--:--`. World time is server-authoritative (**D-W02**) and arrives with its own package — a real device clock here would quietly contradict a frozen decision.
