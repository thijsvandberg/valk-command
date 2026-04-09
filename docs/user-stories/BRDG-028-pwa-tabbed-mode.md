# VC-028: PWA with Tabbed Application Mode

**Status:** In Progress
**Priority:** Medium

## Description

As the PO, I want to install Valk Command as a PWA with tabbed application mode so I can access it from the Dock like a native app while keeping the ability to open multiple views (Sprint Board, Chat, Dashboard, etc.) in separate tabs within the same window.

## Core Concepts

- **Tabbed display mode**: Chromium experimental feature (`display_override: ["tabbed"]`) that adds a native tab strip to the PWA window
- **Fallback chain**: Falls back to `standalone` on browsers that don't support tabbed mode (Safari, Firefox), which still gives the Dock icon benefit
- **Service Worker**: Minimal service worker required for PWA installability (no offline caching needed for now)
- **Manifest**: Web App Manifest with app metadata, icons, and tabbed configuration

## Acceptance Criteria

### Phase 1: Basic PWA installability
- [x] Add `manifest.webmanifest` with app name, colors, icons, and display settings
- [x] Add manifest link and required meta tags to the root layout
- [x] Add a minimal service worker that satisfies Chrome's installability criteria
- [x] Register the service worker from the client
- [ ] App is installable via Chrome's "Install app" prompt
- [ ] Installed app shows "Bridge" in the Dock with the correct icon

### Phase 2: Tabbed mode
- [x] Set `display_override: ["tabbed"]` in the manifest
- [x] Configure `tab_strip` settings for home tab behavior
- [ ] Verify Cmd+T opens a new tab within the PWA window
- [ ] Verify navigating between views works correctly within tabs
- [ ] Verify fallback to `standalone` works on unsupported browsers

### Phase 3: App icons
- [x] Generate icon set in required sizes (192x192, 512x512 minimum)
- [x] Add maskable icon variant for Android
- [x] Add Apple touch icon for Safari/iOS

## Technical Notes

- Next.js supports manifest via the Metadata API (`app/manifest.ts` or `app/manifest.webmanifest`)
- Service worker can be placed in `public/sw.js` (static) or generated
- Tabbed mode requires `chrome://flags/#enable-desktop-pwas-tab-strip` to be enabled (or Chrome 130+ where it may be on by default)
- No offline support needed; this is a single-user tool that always requires network access to Jira and valk-agent

## Out of Scope (for now)
- Offline caching / offline-first support
- Push notifications via service worker (covered by VC-027)
- App store distribution (Google Play TWA, Microsoft Store)
- Custom install prompt UI
