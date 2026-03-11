import { generateNarrative } from '../services/aiService.js';

export async function generateReport(req, res, next) {
  try {
    const { clientName, current, previous, industry } = req.body;

    if (!clientName || !current) {
      return res.status(400).json({ message: 'clientName and current metrics are required' });
    }

    const result = await generateNarrative(clientName, current, previous || null, industry || 'Other');

    res.json(result);
  } catch (err) {
    next(err);
  }
}
