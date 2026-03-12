import * as svc from '../services/moodboardsService.js';
import * as approvalSvc from '../services/moodboardApprovalService.js';
import { exportMoodBoardPdf } from '../services/moodboardPdfService.js';

// ── Boards ──

export async function createBoard(req, res, next) {
  try {
    const data = await svc.createBoard(req.org.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function listBoards(req, res, next) {
  try {
    const { client_id } = req.query;
    const data = await svc.listBoards(req.org.id, { clientId: client_id });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getBoard(req, res, next) {
  try {
    const data = await svc.getBoard(req.org.id, req.params.boardId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateBoard(req, res, next) {
  try {
    const data = await svc.updateBoard(req.org.id, req.params.boardId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function deleteBoard(req, res, next) {
  try {
    const data = await svc.deleteBoard(req.org.id, req.params.boardId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function duplicateBoard(req, res, next) {
  try {
    const data = await svc.duplicateBoard(req.org.id, req.params.boardId, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

// ── Shots ──

export async function addShot(req, res, next) {
  try {
    const data = await svc.addShot(req.org.id, req.params.boardId, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function updateShot(req, res, next) {
  try {
    const data = await svc.updateShot(req.org.id, req.params.shotId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function deleteShot(req, res, next) {
  try {
    const data = await svc.deleteShot(req.org.id, req.params.shotId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function reorderShots(req, res, next) {
  try {
    const data = await svc.reorderShots(req.org.id, req.params.boardId, req.body.shotIds);
    res.json(data);
  } catch (e) { next(e); }
}

export async function toggleShotComplete(req, res, next) {
  try {
    const data = await svc.toggleShotComplete(req.org.id, req.params.shotId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Images ──

export async function uploadImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const data = await svc.uploadImage(
      req.org.id,
      req.params.shotId,
      req.file.buffer,
      req.file.originalname,
      req.file.size,
    );
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function deleteImage(req, res, next) {
  try {
    const data = await svc.deleteImage(req.org.id, req.params.imageId);
    res.json(data);
  } catch (e) { next(e); }
}

// ── Comments ──

export async function addComment(req, res, next) {
  try {
    const data = await svc.addComment(req.org.id, req.params.shotId, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

// ── PDF Export ──

export async function exportPdf(req, res, next) {
  try {
    const result = await exportMoodBoardPdf(req.org.id, req.params.boardId);
    if (result.pdfUrl) {
      res.json({ pdfUrl: result.pdfUrl });
    } else {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
      });
      res.send(result.pdfBuffer);
    }
  } catch (e) { next(e); }
}

// ── Public Approval ──

export async function getBoardByToken(req, res, next) {
  try {
    const data = await approvalSvc.getBoardByApprovalToken(req.params.token);
    res.json(data);
  } catch (e) { next(e); }
}

export async function respondToShot(req, res, next) {
  try {
    const data = await approvalSvc.respondToShot(req.params.token, req.params.shotId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function addClientComment(req, res, next) {
  try {
    const data = await approvalSvc.addClientComment(req.params.token, req.params.shotId, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}
