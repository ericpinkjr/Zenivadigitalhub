import { supabaseAdmin } from '../config/supabase.js';

/**
 * Loads the authenticated user's org membership and attaches req.org.
 * Must be used AFTER the auth middleware (requires req.user).
 */
export async function orgAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { data, error } = await supabaseAdmin
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', req.user.id)
    .limit(1)
    .single();

  if (error || !data) {
    return res.status(403).json({ message: 'Not a member of any organization' });
  }

  req.org = { id: data.org_id, role: data.role };
  next();
}

/**
 * Middleware factory that restricts access to specific org roles.
 * Usage: requireRole('owner') or requireRole('owner', 'lead')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.org) {
      return res.status(403).json({ message: 'Organization context required' });
    }
    if (!roles.includes(req.org.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}
