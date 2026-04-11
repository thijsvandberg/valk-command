# BRDG-064: API Token Rotation and Secret Management

**Status:** Open
**Priority:** Medium

## Description

As the app owner, I want API tokens stored securely with a way to rotate them and health checks that warn when tokens may be expired so credentials are managed safely.

## Core Concepts

- **Token health check**: test Jira and Bitbucket tokens on startup and periodically
- **Expiry warning**: alert when API calls start failing with 401 (token expired)
- **Rotation support**: settings page to update tokens without restarting the app
- **Encrypted storage**: tokens encrypted at rest in SQLite (not plain text .env for runtime tokens)
- **Audit trail**: log token changes in activity log
- **Graceful degradation**: if a token is invalid, disable that integration and show a warning

## Acceptance Criteria

### Phase 1: Token health check endpoints
- [ ] API route `src/app/api/jira/health/route.ts` that tests the Jira API token
- [ ] API route `src/app/api/bitbucket/health/route.ts` that tests the Bitbucket API token
- [ ] Health check makes a lightweight API call (e.g. get current user) to verify validity
- [ ] Return structured response: `{ status: "healthy" | "unhealthy", message: string, checkedAt: string }`
- [ ] Health check runs on app startup (non-blocking, logs result)
- [ ] Periodic health check every 30 minutes (via scheduler or interval)

### Phase 2: Integration health display on settings page
- [ ] Settings page section showing health status of each integration
- [ ] Visual indicator: green for healthy, red for unhealthy, gray for unchecked
- [ ] Last checked timestamp displayed next to each integration
- [ ] Manual "Test Connection" button to trigger health check on demand
- [ ] Error message displayed when an integration is unhealthy

### Phase 3: Token update via settings UI
- [ ] Settings form to update Jira API token, email, and base URL
- [ ] Settings form to update Bitbucket API token, email, and workspace
- [ ] Settings form to update Workspace API URL
- [ ] Token fields masked by default (show/hide toggle)
- [ ] Automatic health check after token update to verify the new token works
- [ ] Rollback to previous token if new token fails health check

### Phase 4: Encrypted token storage in database
- [ ] `appSetting` table in SQLite for storing runtime configuration
- [ ] AES-256 encryption for token values at rest
- [ ] Encryption key sourced from environment variable `BRIDGE_ENCRYPTION_KEY`
- [ ] Utility functions for encrypt/decrypt at `src/lib/crypto.ts`
- [ ] Migration path: initial tokens from `.env.local`, subsequent updates via settings UI
- [ ] Fallback to `.env.local` values if no database-stored tokens exist

### Phase 5: Expiry detection and alert
- [ ] Monitor API responses for 401 status codes across all integration calls
- [ ] Count consecutive 401 responses (threshold: 3 in a row)
- [ ] Trigger alert notification when token appears expired
- [ ] Alert visible in the app header or sidebar (persistent until dismissed)
- [ ] Disable affected integration features when token is confirmed expired
- [ ] Re-enable features automatically when a valid token is provided

### Phase 6: Activity log entries for token changes
- [ ] Log entry when a token is updated (who, when, which integration)
- [ ] Log entry when a token health check fails
- [ ] Log entry when a token is detected as expired
- [ ] Activity log viewable on the settings page
- [ ] Never log the actual token value (only metadata about the change)

## Technical Notes

- Current tokens are in `.env.local` (plain text)
- Runtime token storage in `appSetting` table with encryption (AES-256)
- Encryption key from environment variable `BRIDGE_ENCRYPTION_KEY`
- Health check endpoints: `/api/jira/health` and `/api/bitbucket/health`
- Settings page section for integration credentials
- Token test: make a lightweight API call (e.g. get current user) to verify validity
- The `crypto` module in Node.js provides AES-256-GCM for encryption
- Consider storing an IV (initialization vector) alongside each encrypted value

## Out of Scope (for now)

- Automatic token refresh (OAuth flow)
- Hardware security modules (HSM)
- Key management service (KMS) integration
- Token expiry date tracking (most API tokens do not have predictable expiry)
- Multi-user token management
