# BRDG-064: API Token Rotation and Secret Management

**Status:** Open
**Priority:** Medium

## Description

As the app owner, I want API tokens managed securely with encrypted storage and a settings UI for rotation so credentials are not stored in plain text and can be updated without restarting the app.

## Acceptance Criteria

### Phase 1: Token settings page
- [ ] Settings page section for managing integration tokens
- [ ] Fields for: Jira API token, Bitbucket API token
- [ ] Masked display (show last 4 characters only)
- [ ] "Update" button per token that opens an input field
- [ ] "Test connection" button that verifies the token works

### Phase 2: Encrypted storage
- [ ] Encrypt tokens before storing in `appSetting` table
- [ ] Encryption key derived from app secret (env var)
- [ ] Decrypt on read for API calls
- [ ] Use AES-256-GCM or similar symmetric encryption

### Phase 3: Health monitoring
- [ ] Check token validity on each sync cycle (detect 401 responses)
- [ ] Alert when a token returns authentication errors
- [ ] Show token status in settings: "Valid", "Expired", "Error"
- [ ] Activity log entry when token rotation occurs

### Phase 4: Migration
- [ ] One-time migration: move tokens from .env.local to encrypted DB storage
- [ ] Fall back to env vars if DB tokens are not set (backward compatible)
- [ ] Clear migration instructions in documentation

## Technical Notes

- Encryption key: `APP_SECRET` env var (the only secret that must stay in .env)
- Node.js `crypto` module for AES-256-GCM encryption/decryption
- Store encrypted value + IV + auth tag in the appSetting table
- Token rotation is simply updating the encrypted value; no session invalidation needed

## Out of Scope (for now)
- HashiCorp Vault or external secret managers
- Automatic token refresh (OAuth refresh tokens)
- Key rotation for the encryption key itself
- Audit log of who changed tokens (single user)
