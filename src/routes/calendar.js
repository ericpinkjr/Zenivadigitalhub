import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { getSuggestions } from '../controllers/calendarController.js';

const router = Router();

router.get('/suggestions', auth, getSuggestions);

export default router;
