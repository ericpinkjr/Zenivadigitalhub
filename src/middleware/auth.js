import { supabaseAdmin } from '../config/supabase.js';

export async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = user;

    // Load org membership (non-blocking — new users may not have one yet)
    const { data: membership } = await supabaseAdmin
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (membership) {
      req.org = { id: membership.org_id, role: membership.role };
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Authentication failed' });
  }
}
