import { exportReportPdf } from '../services/pdfService.js';

export async function exportPdf(req, res, next) {
  try {
    const { reportId } = req.params;
    const result = await exportReportPdf(req.user.id, reportId);

    if (result.pdfUrl) {
      // PDF was uploaded to storage — return the URL
      return res.json({ pdf_url: result.pdfUrl, fileName: result.fileName });
    }

    // Fallback: stream the PDF directly
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.pdfBuffer);
  } catch (e) { next(e); }
}
