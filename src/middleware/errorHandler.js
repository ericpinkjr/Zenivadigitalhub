import { ApiError } from '../utils/apiError.js';

export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message });
  }

  console.error('[ERROR]', err.stack || err);
  res.status(500).json({ message: err.message || 'Internal server error' });
}
