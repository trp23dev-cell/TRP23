using UnityEngine.UIElements;

namespace TrapMadeIt.UI.Phone
{
    /// <summary>
    /// One app on the Phone.
    ///
    /// WHY AN INTERFACE FOR SIX PLACEHOLDERS
    ///
    /// Because of what happens next. Map, Messages, Missions, Drops, Contacts
    /// and Wallet are six separate future packages, and the failure mode for a
    /// phone UI is well known: one PhoneController that grows a branch per app
    /// until nothing can be changed without reading all of it. Splitting now
    /// costs one small file; splitting later costs a rewrite.
    ///
    /// It is deliberately the smallest thing that achieves that. No lifecycle
    /// beyond show, no navigation stack per app, no dependency injection — an
    /// app builds a VisualElement and is told when it comes on screen. Anything
    /// more would be building a framework for apps that do not exist yet, which
    /// is the other way this goes wrong.
    /// </summary>
    public interface IPhoneApp
    {
        /// <summary>Stable id. Used for navigation and nothing else.</summary>
        string Id { get; }

        /// <summary>Shown on the home tile and in the app's title bar.</summary>
        string Title { get; }

        /// <summary>
        /// The home-screen icon. A glyph rather than a texture on purpose —
        /// the package is not allowed to spend its time making final branding
        /// art, and a glyph is replaceable by an image without touching this
        /// interface.
        /// </summary>
        string Glyph { get; }

        /// <summary>
        /// Build the app's surface once. Called lazily, the first time the app
        /// is opened, so a phone that is never opened costs nothing.
        /// </summary>
        VisualElement Build();

        /// <summary>
        /// Called every time the app comes to the front. Refresh here, not in
        /// Build — Build happens once and the numbers move.
        /// </summary>
        void OnShow();
    }
}
