-- ============================================================
-- Migration: Direct User Permissions (RBAC Enhancement)
-- Date: 2026-09-15
-- Desc: Adds user_permissions table + get_effective_permissions()
--       function to allow per-user permission overrides on top
--       of role-based permissions.
-- ============================================================

-- 1. Create user_permissions table
-- ---------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted       boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, permission_id)
);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
  ON user_permissions(user_id);

-- Index for fast per-permission lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id
  ON user_permissions(permission_id);

-- 2. Row Level Security
-- ----------------------
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Only super_admin and admin roles can manage direct user permissions
CREATE POLICY "admins_manage_user_permissions"
  ON user_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin')
    )
  );

-- Allow users to read their own direct permissions (needed for AuthContext)
CREATE POLICY "users_read_own_permissions"
  ON user_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- 3. Supabase RPC: sync_user_permissions
-- ----------------------------------------
-- Atomically replaces all direct permissions for a user.
-- p_user_id       : Target user UUID
-- p_permission_ids: Array of permission UUIDs to grant (others are removed)
CREATE OR REPLACE FUNCTION sync_user_permissions(
  p_user_id       uuid,
  p_permission_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete all existing direct permissions for this user
  DELETE FROM user_permissions WHERE user_id = p_user_id;

  -- Re-insert only the selected ones
  IF array_length(p_permission_ids, 1) > 0 THEN
    INSERT INTO user_permissions (user_id, permission_id, granted)
    SELECT p_user_id, unnest(p_permission_ids), true
    ON CONFLICT (user_id, permission_id) DO UPDATE SET granted = true;
  END IF;
END;
$$;

-- 4. Helper View: effective_permissions_view (optional, for reporting)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW effective_permissions_view AS
SELECT
  pr.id        AS user_id,
  pr.full_name AS user_name,
  pr.role      AS role_name,
  p.module,
  p.action,
  CASE
    WHEN rp.permission_id IS NOT NULL AND up.permission_id IS NOT NULL THEN 'both'
    WHEN rp.permission_id IS NOT NULL THEN 'role'
    WHEN up.permission_id IS NOT NULL THEN 'direct'
  END AS source
FROM profiles pr
LEFT JOIN role_permissions rp ON rp.role_id = pr.role_id
LEFT JOIN permissions p      ON p.id = rp.permission_id
LEFT JOIN user_permissions up ON up.user_id = pr.id AND up.permission_id = p.id AND up.granted = true
WHERE p.id IS NOT NULL;

-- ============================================================
-- HOW TO USE (in AuthContext.tsx):
--
--   // After fetching role_permissions:
--   const { data: userPerms } = await supabase
--     .from('user_permissions')
--     .select('permissions(module, action)')
--     .eq('user_id', user.id)
--     .eq('granted', true);
--
--   userPerms?.forEach(up => {
--     if (up.permissions) permsSet.add(`${up.permissions.module}.${up.permissions.action}`);
--   });
--
-- HOW TO SAVE (in UserPermissionsEditor.tsx):
--   await supabase.rpc('sync_user_permissions', {
--     p_user_id: selectedUserId,
--     p_permission_ids: Array.from(directPermissions)
--   });
-- ============================================================
