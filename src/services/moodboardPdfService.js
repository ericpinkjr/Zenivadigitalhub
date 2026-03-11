import puppeteer from 'puppeteer';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

function buildMoodBoardHtml(board, shots) {
  const theme = board.theme || { accent: '#D0B2FF', bg: '#0F0F12', card: '#1A1A22', text: 'rgba(255,255,255,0.9)' };
  const clientName = board.client_name || '';
  const completedCount = shots.filter(s => s.is_completed).length;

  const coverPage = `
    <div class="page cover">
      <div class="cover-band" style="background: linear-gradient(135deg, ${theme.accent}, ${theme.accent}88);"></div>
      <div class="cover-content">
        <div class="cover-label">SHOOT MOOD BOARD</div>
        <h1 class="cover-title">${escapeHtml(board.name)}</h1>
        ${board.description ? `<p class="cover-desc">${escapeHtml(board.description)}</p>` : ''}
        ${clientName ? `<div class="cover-client">Prepared for ${escapeHtml(clientName)}</div>` : ''}
        <div class="cover-meta">
          <span>${shots.length} Shots</span>
          <span>${completedCount}/${shots.length} Completed</span>
          <span>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>
      <div class="cover-footer">Zeniva Digital</div>
    </div>
  `;

  // 2 shots per page
  const shotPages = [];
  for (let i = 0; i < shots.length; i += 2) {
    const pair = shots.slice(i, i + 2);
    const cards = pair.map((shot, j) => {
      const num = String(i + j + 1).padStart(2, '0');
      const hero = shot.images?.[0]?.public_url;
      const thumbs = (shot.images || []).slice(1, 4);
      const checkmark = shot.is_completed ? '\u2713' : '';
      const approvalBadge = shot.approval_status === 'approved'
        ? '<span class="badge approved">APPROVED</span>'
        : shot.approval_status === 'rejected'
        ? '<span class="badge rejected">CHANGES</span>'
        : '';

      return `
        <div class="shot-card" style="flex: 1; min-width: 0;">
          <div class="shot-header">
            <div class="shot-check ${shot.is_completed ? 'done' : ''}">${checkmark}</div>
            <span class="shot-num" style="color: ${theme.accent};">${num}</span>
            <div class="shot-info">
              <div class="shot-title">${escapeHtml(shot.title)}</div>
              <div class="shot-desc">${escapeHtml(shot.description || '')}</div>
            </div>
            ${approvalBadge}
          </div>
          ${hero ? `
            <div class="shot-hero">
              <img src="${hero}" />
            </div>
          ` : '<div class="shot-hero empty">No reference images</div>'}
          ${thumbs.length > 0 ? `
            <div class="shot-thumbs">
              ${thumbs.map(t => `<img src="${t.public_url}" />`).join('')}
              ${(shot.images || []).length > 4 ? `<div class="thumb-more">+${shot.images.length - 4}</div>` : ''}
            </div>
          ` : ''}
          ${shot.notes ? `<div class="shot-notes"><strong>Notes:</strong> ${escapeHtml(shot.notes)}</div>` : ''}
        </div>
      `;
    }).join('');

    shotPages.push(`<div class="page shots-page"><div class="shots-row">${cards}</div></div>`);
  }

  // Summary page
  const summaryRows = shots.map((s, i) => `
    <tr>
      <td class="sum-num" style="color: ${theme.accent};">${String(i + 1).padStart(2, '0')}</td>
      <td>${escapeHtml(s.title)}</td>
      <td class="${s.is_completed ? 'sum-done' : ''}">${s.is_completed ? '\u2713 Done' : 'Pending'}</td>
      <td>${s.approval_status === 'approved' ? '\u2713 Approved' : s.approval_status === 'rejected' ? 'Changes' : '\u2014'}</td>
      <td>${(s.images || []).length}</td>
    </tr>
  `).join('');

  const summaryPage = `
    <div class="page summary-page">
      <h2>Shot Checklist</h2>
      <table>
        <thead><tr><th>#</th><th>Shot</th><th>Status</th><th>Approval</th><th>Photos</th></tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </div>
  `;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; background: ${theme.bg}; color: ${theme.text}; }
  .page { width: 1123px; height: 794px; padding: 40px 48px; position: relative; page-break-after: always; overflow: hidden; background: ${theme.bg}; }

  /* Cover */
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cover-band { position: absolute; top: 0; left: 0; right: 0; height: 6px; }
  .cover-label { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: ${theme.accent}; margin-bottom: 16px; }
  .cover-title { font-size: 42px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; margin-bottom: 12px; }
  .cover-desc { font-size: 14px; color: rgba(255,255,255,0.5); max-width: 500px; margin-bottom: 20px; }
  .cover-client { font-size: 13px; color: ${theme.accent}; margin-bottom: 24px; font-weight: 600; }
  .cover-meta { display: flex; gap: 24px; font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.4); }
  .cover-footer { position: absolute; bottom: 30px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.2); letter-spacing: 0.1em; text-transform: uppercase; }

  /* Shot pages */
  .shots-page { display: flex; align-items: stretch; }
  .shots-row { display: flex; gap: 24px; width: 100%; height: 100%; }
  .shot-card { background: ${theme.card}; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; overflow: hidden; }
  .shot-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .shot-check { width: 20px; height: 20px; border-radius: 5px; border: 2px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
  .shot-check.done { background: #10B981; border-color: #10B981; color: white; }
  .shot-num { font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 700; flex-shrink: 0; }
  .shot-info { flex: 1; min-width: 0; }
  .shot-title { font-size: 14px; font-weight: 600; }
  .shot-desc { font-size: 11px; color: rgba(255,255,255,0.35); font-style: italic; margin-top: 2px; }
  .shot-hero { flex: 1; border-radius: 8px; overflow: hidden; min-height: 0; }
  .shot-hero img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
  .shot-hero.empty { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.1); color: rgba(255,255,255,0.2); font-size: 12px; }
  .shot-thumbs { display: flex; gap: 6px; margin-top: 10px; height: 60px; }
  .shot-thumbs img { height: 60px; width: 48px; object-fit: cover; border-radius: 4px; }
  .thumb-more { height: 60px; width: 48px; background: rgba(255,255,255,0.06); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: rgba(255,255,255,0.4); font-family: 'DM Mono', monospace; }
  .shot-notes { margin-top: 10px; font-size: 11px; color: rgba(255,255,255,0.5); line-height: 1.5; }
  .badge { font-family: 'DM Mono', monospace; font-size: 9px; padding: 3px 8px; border-radius: 12px; letter-spacing: 0.04em; flex-shrink: 0; }
  .badge.approved { background: rgba(16,185,129,0.15); color: #10B981; }
  .badge.rejected { background: rgba(239,68,68,0.15); color: #EF4444; }

  /* Summary */
  .summary-page h2 { font-size: 20px; font-weight: 700; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 14px; text-align: left; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  th { font-family: 'DM Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .sum-num { font-family: 'DM Mono', monospace; font-weight: 700; }
  .sum-done { color: #10B981; }

  @media print { .page { page-break-after: always; } }
</style>
</head><body>
${coverPage}
${shotPages.join('\n')}
${summaryPage}
</body></html>`;
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function exportMoodBoardPdf(ownerId, boardId) {
  // Verify ownership
  const { data: board, error: boardErr } = await supabaseAdmin
    .from('mood_boards')
    .select('*, clients(name, brand_color)')
    .eq('id', boardId)
    .eq('owner_id', ownerId)
    .single();
  if (boardErr || !board) throw new ApiError(404, 'Board not found');

  board.client_name = board.clients?.name || '';

  // Get shots with images
  const { data: shots } = await supabaseAdmin
    .from('mood_board_shots')
    .select('*, mood_board_images(*)')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  const processedShots = (shots || []).map(s => ({
    ...s,
    images: (s.mood_board_images || []).sort((a, b) => a.position - b.position),
    mood_board_images: undefined,
  }));

  const html = buildMoodBoardHtml(board, processedShots);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({
      width: '1123px',
      height: '794px',
      printBackground: true,
      landscape: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const fileName = `${(board.name || 'moodboard').replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    const storagePath = `moodboards/${boardId}/${fileName}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('report-pdfs')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      console.warn('[MoodBoard PDF] Storage upload failed:', uploadErr.message);
      return { pdfBuffer, fileName };
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('report-pdfs')
      .getPublicUrl(storagePath);

    return { pdfUrl: urlData?.publicUrl || null, pdfBuffer, fileName };
  } finally {
    await browser.close();
  }
}
