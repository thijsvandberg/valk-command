-- Remove auth rows that were used by the custom JWT/password auth system.
-- These keys are no longer needed after migrating to Clerk.
DELETE FROM app_setting WHERE key IN ('auth_password_hash', 'jwt_secret');
