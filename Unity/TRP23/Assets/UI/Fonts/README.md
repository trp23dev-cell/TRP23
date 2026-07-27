# Fonts

The web build uses **woff2** fonts, which Unity can't import. To match the
typography exactly, drop the **TTF** versions of these Google Fonts here:

- **Barlow Condensed** — Regular / Medium / SemiBold / Bold (UI text)
- **Pirata One** — Regular (display / logo wordmark fallback)
- **Special Elite** — Regular (typewriter accents)

Get them free from Google Fonts (Download family → the `.ttf` files).

Until they're added, the UI renders with Unity's default font at the correct
sizes/weights/spacing/colours — so layout and identity are preserved; only the
letterforms differ. Once the TTFs are here, reference them in the USS via
`-unity-font-definition` (or ask me to wire them into `TrapTokens.uss`).
