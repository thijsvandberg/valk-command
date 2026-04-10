# BRDG-076: Figma Integration

**Status:** Open
**Priority:** Low

## Description

As the PO, I want to attach Figma links to tickets and see live design thumbnails in the ticket detail so I can verify implementation against designs without switching tools.

## Acceptance Criteria

### Phase 1: Figma link storage
- [ ] "Link Figma" button in ticket detail sidebar
- [ ] Input field accepting Figma URLs (file, frame, or prototype links)
- [ ] Store in DB: `ticketFigmaLink` table (ticketKey, figmaUrl, label, createdAt)
- [ ] Multiple Figma links per ticket
- [ ] Delete link action

### Phase 2: Thumbnail preview
- [ ] Use Figma API to generate image thumbnails for linked files/frames
- [ ] Display thumbnail in the ticket sidebar (small, clickable)
- [ ] Click opens the Figma link in a new tab
- [ ] Thumbnail refresh button (designs may change)
- [ ] Fallback: show Figma icon + link text if API access is not configured

### Phase 3: Design comparison
- [ ] Side-by-side view: Figma thumbnail next to the ticket description
- [ ] Useful during refinement to verify story matches design intent
- [ ] Zoom/pan on thumbnail for detail inspection

## Technical Notes

- Figma REST API: `GET /v1/images/{file_key}` for thumbnails
- Requires Figma personal access token
- Parse Figma URL to extract file key and node ID
- Cache thumbnails locally (images may be large)
- Figma API rate limit: 30 req/min

## Out of Scope (for now)
- Figma embed (live interactive frame)
- Design token extraction
- Figma comments integration
- Auto-detect Figma links in descriptions
