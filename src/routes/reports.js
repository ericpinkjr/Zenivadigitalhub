import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import {
  listReports, listAllReports, createReport, updateReport,
  getPublicReport, getPublicClientReports, autoGenerateReport,
} from '../controllers/reportsController.js';
import { exportPdf } from '../controllers/pdfController.js';

const router = Router();

// Authenticated routes
router.get('/all', auth, listAllReports);
router.get('/client/:clientId', auth, listReports);
router.post('/', auth, createReport);
router.post('/generate/:clientId', auth, autoGenerateReport);
router.post('/export/:reportId', auth, exportPdf);
router.patch('/:reportId', auth, updateReport);

// Public routes (no auth — for client portal)
router.get('/public/slug/:slug', getPublicReport);
router.get('/public/client/:clientId', getPublicClientReports);

export default router;
