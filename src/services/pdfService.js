import puppeteer from 'puppeteer';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../utils/apiError.js';

function fmtNum(n) {
  if (n == null) return '—';
  const num = typeof n === 'string' ? parseFloat(n.replace(/,/g, '')) : n;
  if (isNaN(num)) return '—';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function buildReportHtml(report, client) {
  const color = client.brand_color || '#D0B2FF';
  const name = client.name || 'Client';
  const month = report.month || '';
  const year = report.year || '';

  // Metrics rows — only show what's available
  const metricRows = [];

  // Social metrics
  if (report.ig_followers) metricRows.push({ label: 'IG Followers', value: fmtNum(report.ig_followers) });
  if (report.ig_reach) metricRows.push({ label: 'IG Reach', value: fmtNum(report.ig_reach) });
  if (report.ig_likes) metricRows.push({ label: 'IG Likes', value: fmtNum(report.ig_likes) });
  if (report.ig_comments) metricRows.push({ label: 'IG Comments', value: fmtNum(report.ig_comments) });
  if (report.ig_shares) metricRows.push({ label: 'IG Shares', value: fmtNum(report.ig_shares) });
  if (report.ig_saves) metricRows.push({ label: 'IG Saves', value: fmtNum(report.ig_saves) });
  if (report.tk_followers) metricRows.push({ label: 'TK Followers', value: fmtNum(report.tk_followers) });
  if (report.tk_video_views) metricRows.push({ label: 'TK Views', value: fmtNum(report.tk_video_views) });
  if (report.tk_likes) metricRows.push({ label: 'TK Likes', value: fmtNum(report.tk_likes) });

  // Meta ad metrics
  if (report.meta_spend) metricRows.push({ label: 'Ad Spend', value: `$${parseFloat(report.meta_spend).toFixed(2)}` });
  if (report.meta_impressions) metricRows.push({ label: 'Impressions', value: fmtNum(report.meta_impressions) });
  if (report.meta_reach) metricRows.push({ label: 'Ad Reach', value: fmtNum(report.meta_reach) });
  if (report.meta_clicks) metricRows.push({ label: 'Clicks', value: fmtNum(report.meta_clicks) });
  if (report.meta_ctr) metricRows.push({ label: 'CTR', value: `${parseFloat(report.meta_ctr).toFixed(2)}%` });
  if (report.meta_conversions) metricRows.push({ label: 'Conversions', value: fmtNum(report.meta_conversions) });
  if (report.meta_roas) metricRows.push({ label: 'ROAS', value: `${parseFloat(report.meta_roas).toFixed(2)}x` });

  const metricsGrid = metricRows.map(m => `
    <div style="background:#1A1A22;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 18px;">
      <div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;font-family:'DM Mono',monospace;">${m.label}</div>
      <div style="font-size:22px;font-weight:700;color:rgba(255,255,255,0.9);font-family:'DM Mono',monospace;">${m.value}</div>
    </div>
  `).join('');

  const summary = report.ai_summary || report.narrative || '';
  const igInsight = report.ai_ig_insight || '';
  const tkInsight = report.ai_tk_insight || '';
  const headlineWin = report.ai_headline_win || '';
  const watchOut = report.ai_watch_out || '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0F0F12;
      color: rgba(255,255,255,0.9);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page { width: 794px; min-height: 1123px; padding: 0; position: relative; }
  </style>
</head>
<body>
  <div class="page">
    <!-- Cover band -->
    <div style="height:6px;background:linear-gradient(90deg, ${color}, ${color}66, transparent);"></div>

    <!-- Header -->
    <div style="padding:48px 56px 32px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.15em;font-family:'DM Mono',monospace;margin-bottom:8px;">Monthly Performance Report</div>
          <h1 style="font-size:36px;font-weight:800;color:rgba(255,255,255,0.95);letter-spacing:-0.02em;line-height:1.1;margin-bottom:8px;">${name}</h1>
          <div style="font-size:18px;color:${color};font-weight:600;">${month} ${year}</div>
          ${client.industry ? `<div style="margin-top:10px;display:inline-block;background:${color}18;color:${color};font-size:11px;font-family:'DM Mono',monospace;font-weight:600;padding:4px 12px;border-radius:20px;border:1px solid ${color}30;">${client.industry}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:rgba(255,255,255,0.3);font-family:'DM Mono',monospace;letter-spacing:0.1em;">PREPARED BY</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:4px;">Zeniva Digital</div>
          ${report.prepared_by ? `<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">${report.prepared_by}</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Divider -->
    <div style="margin:0 56px;height:1px;background:rgba(255,255,255,0.06);"></div>

    <!-- Metrics Grid -->
    ${metricRows.length > 0 ? `
    <div style="padding:32px 56px;">
      <div style="font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.15em;font-family:'DM Mono',monospace;margin-bottom:16px;">Key Metrics</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${metricsGrid}
      </div>
    </div>
    ` : ''}

    <!-- AI Narrative -->
    ${summary ? `
    <div style="padding:0 56px 32px;">
      <div style="font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.15em;font-family:'DM Mono',monospace;margin-bottom:16px;">Executive Summary</div>
      <div style="background:#1A1A22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;border-left:3px solid ${color};">
        <p style="font-size:14px;line-height:1.7;color:rgba(255,255,255,0.75);">${summary}</p>
      </div>
    </div>
    ` : ''}

    <!-- Insights -->
    ${(igInsight || tkInsight) ? `
    <div style="padding:0 56px 32px;">
      <div style="font-size:11px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.15em;font-family:'DM Mono',monospace;margin-bottom:16px;">Platform Insights</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${igInsight ? `
        <div style="background:#1A1A22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;">
          <div style="font-size:10px;color:#E1306C;font-family:'DM Mono',monospace;font-weight:700;margin-bottom:8px;letter-spacing:0.08em;">INSTAGRAM</div>
          <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,0.65);">${igInsight}</p>
        </div>` : ''}
        ${tkInsight ? `
        <div style="background:#1A1A22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;">
          <div style="font-size:10px;color:#69C9D0;font-family:'DM Mono',monospace;font-weight:700;margin-bottom:8px;letter-spacing:0.08em;">TIKTOK</div>
          <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,0.65);">${tkInsight}</p>
        </div>` : ''}
      </div>
    </div>
    ` : ''}

    <!-- Win & Watch -->
    ${(headlineWin || watchOut) ? `
    <div style="padding:0 56px 32px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${headlineWin ? `
        <div style="background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:20px;">
          <div style="font-size:10px;color:#34D399;font-family:'DM Mono',monospace;font-weight:700;margin-bottom:8px;letter-spacing:0.08em;">BIGGEST WIN</div>
          <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,0.7);">${headlineWin}</p>
        </div>` : ''}
        ${watchOut ? `
        <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:20px;">
          <div style="font-size:10px;color:#FBBF24;font-family:'DM Mono',monospace;font-weight:700;margin-bottom:8px;letter-spacing:0.08em;">WATCH OUT</div>
          <p style="font-size:13px;line-height:1.6;color:rgba(255,255,255,0.7);">${watchOut}</p>
        </div>` : ''}
      </div>
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="position:absolute;bottom:0;left:0;right:0;padding:20px 56px;border-top:1px solid rgba(255,255,255,0.04);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:10px;color:rgba(255,255,255,0.25);font-family:'DM Mono',monospace;">Reports by Zeniva Digital</span>
        <span style="font-size:10px;color:rgba(255,255,255,0.25);font-family:'DM Mono',monospace;">${month} ${year} · ${name}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function exportReportPdf(orgId, reportId) {
  // 1. Get report
  const { data: report, error: reportErr } = await supabaseAdmin
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .eq('org_id', orgId)
    .single();

  if (reportErr || !report) throw new ApiError(404, 'Report not found');

  // 2. Get client
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', report.client_id)
    .single();

  if (clientErr || !client) throw new ApiError(404, 'Client not found');

  // 3. Build HTML
  const html = buildReportHtml(report, client);

  // 4. Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    // 5. Upload to Supabase Storage
    const fileName = `${client.name.replace(/[^a-zA-Z0-9]/g, '-')}-${report.month}-${report.year}.pdf`;
    const storagePath = `reports/${report.id}/${fileName}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('report-pdfs')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      // If storage bucket doesn't exist, return the PDF directly
      // The caller can handle this case
      return { pdfBuffer, fileName };
    }

    // 6. Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('report-pdfs')
      .getPublicUrl(storagePath);

    const pdfUrl = urlData?.publicUrl || null;

    // 7. Save URL back to report
    if (pdfUrl) {
      await supabaseAdmin
        .from('reports')
        .update({ pdf_url: pdfUrl })
        .eq('id', reportId);
    }

    return { pdfUrl, pdfBuffer, fileName };
  } finally {
    await browser.close();
  }
}
