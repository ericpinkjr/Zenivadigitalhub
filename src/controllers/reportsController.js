import * as reportsService from '../services/reportsService.js';
import { generateReport as generateReportService } from '../services/reportGeneratorService.js';
import { ApiError } from '../utils/apiError.js';

export async function listReports(req, res, next) {
  try {
    const { clientId } = req.params;
    const data = await reportsService.getReports(req.user.id, clientId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function listAllReports(req, res, next) {
  try {
    const data = await reportsService.getAllReports(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function createReport(req, res, next) {
  try {
    const data = await reportsService.saveReport(req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function updateReport(req, res, next) {
  try {
    const { reportId } = req.params;
    const data = await reportsService.patchReport(req.user.id, reportId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getPublicReport(req, res, next) {
  try {
    const { slug } = req.params;
    const data = await reportsService.getPublicReport(slug);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getPublicClientReports(req, res, next) {
  try {
    const { clientId } = req.params;
    const data = await reportsService.getPublicReportsForClient(clientId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function autoGenerateReport(req, res, next) {
  try {
    const { clientId } = req.params;
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: 'month and year are required' });
    }

    const result = await generateReportService(req.user.id, clientId, month, parseInt(year));
    res.status(201).json(result);
  } catch (e) { next(e); }
}
