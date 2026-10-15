import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FlightSummaryResponse } from '@/api/flights';

function formatDateTime(dtStr: string | null | undefined): string {
  if (!dtStr) return '—';
  try {
    const clean = dtStr.trim();
    if (clean.includes('T')) {
      const [d, t] = clean.split('T');
      return `${d} ${t.slice(0, 8)}`;
    }
    return clean;
  } catch {
    return dtStr;
  }
}

export function downloadFlightPdf(summary: FlightSummaryResponse) {
  const { flight, kpis, total_duration_minutes, timeline_phases, parameters, events } = summary;

  const fNumStr = flight.flight_number !== undefined ? String(flight.flight_number).padStart(3, '0') : '001';
  const acName = flight.aircraft_number ? `AC${flight.aircraft_number}` : (flight.aircraft_id ? `AC${flight.aircraft_id}` : 'AC');
  const flightDisplayId = `${acName}_${fNumStr}`;
  const nowStr = new Date().toLocaleString('en-GB');

  // Initialize jsPDF in portrait A4
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const primaryColor: [number, number, number] = [24, 76, 120]; // #184c78
  const headerGray: [number, number, number] = [240, 243, 246];

  let currentY = 18;

  // Title Banner
  doc.setFillColor(...primaryColor);
  doc.rect(14, currentY, 182, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('SMART FLIGHT TEST ANALYTICS DASHBOARD (SFTAD)', 18, currentY + 6);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('ARDC / C-DAC · Flight Test Diagnostics & Telemetry Report', 18, currentY + 11);

  currentY += 18;

  // Flight Metadata Box
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Flight Summary: ${flightDisplayId}`, 14, currentY);
  currentY += 4;

  const overviewRows = [
    [
      { content: 'Flight ID', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      flightDisplayId,
      { content: 'System ID', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      String(flight.flight_id),
    ],
    [
      { content: 'Aircraft', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      acName,
      { content: 'Flight Date', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      formatDateTime(flight.flight_date_time),
    ],
    [
      { content: 'Status', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      flight.status || 'UNKNOWN',
      { content: 'Total Duration', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      `${total_duration_minutes.toFixed(2)} min`,
    ],
    [
      { content: 'Configured Mass', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      flight.configured_mass_kg ? `${flight.configured_mass_kg.toLocaleString()} kg` : '—',
      { content: 'Initial Fuel Loaded', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      flight.initial_fuel_kg ? `${flight.initial_fuel_kg.toLocaleString()} kg` : '—',
    ],
    [
      { content: 'All-Up Initial Mass', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      flight.initial_mass_kg ? `${flight.initial_mass_kg.toLocaleString()} kg` : '—',
      { content: 'Report Generated', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      nowStr,
    ],
    [
      { content: 'Ingestion Window', styles: { fontStyle: 'bold' as const, fillColor: headerGray } },
      {
        content: `${formatDateTime(flight.upload_start_time)} to ${formatDateTime(flight.upload_end_time)}`,
        colSpan: 3,
      },
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    body: overviewRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 59 },
      2: { cellWidth: 32 },
      3: { cellWidth: 59 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Section 2: Key Performance Indicators (KPIs)
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('Key Performance Indicators (KPIs)', 14, currentY);
  currentY += 3;

  const kpiData = kpis.map((k) => [
    k.title,
    k.value !== null && k.value !== undefined ? `${k.value.toLocaleString()} ${k.unit}` : '—',
    k.limit_text || '—',
    k.benchmark || '—',
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Metric', 'Measured Value', 'Limit Evaluation', 'Engineering Benchmark']],
    body: kpiData,
    theme: 'striped',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Section 3: Timeline Phases
  if (timeline_phases && timeline_phases.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('Flight Mission Timeline Phases', 14, currentY);
    currentY += 3;

    const phaseData = timeline_phases.map((p) => [
      p.id.toUpperCase(),
      p.name,
      p.start_time,
      p.end_time,
      `${p.duration_min.toFixed(2)} min`,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Phase ID', 'Phase Description', 'Start Time (Clock)', 'End Time (Clock)', 'Duration']],
      body: phaseData,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;
  }

  // Section 4: Full Parameters Table (All 25 Parameters with all details)
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(`Flight Parameters (${parameters.length} parameters)`, 14, currentY);
  currentY += 3;

  const paramData = parameters.map((p, idx) => [
    String(idx + 1),
    p.param_name,
    p.description || '—',
    p.value !== null && p.value !== undefined ? String(p.value) : '—',
    p.unit || '—',
    p.status_label || (p.status === 1 ? 'Complete' : 'Incomplete'),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Parameter Name', 'Description', 'Value', 'Unit', 'Status']],
    body: paramData,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 52 },
      2: { cellWidth: 64 },
      3: { cellWidth: 22 },
      4: { cellWidth: 16 },
      5: { cellWidth: 20 },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Section 5: Full Detected Events Table
  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(`Detected Flight Events (${events.length} events)`, 14, currentY);
  currentY += 3;

  const eventData = events.map((e, idx) => [
    String(idx + 1),
    e.event_name,
    e.occur_seq !== null && e.occur_seq !== undefined ? String(e.occur_seq) : '—',
    formatDateTime(e.date_time),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Event Name', 'Occurrence Seq', 'Timestamp (Microsecond Precision)']],
    body: eventData,
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 80 },
      2: { cellWidth: 32 },
      3: { cellWidth: 60 },
    },
    margin: { left: 14, right: 14 },
  });

  // Footer on all pages
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 130, 140);
    doc.setDrawColor(210, 215, 220);
    doc.line(14, 287, 196, 287);

    doc.text(
      `SFTAD Flight Test Report · ${flightDisplayId} (${acName})`,
      14,
      291
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      196,
      291,
      { align: 'right' }
    );
  }

  // Save the PDF file
  doc.save(`${flightDisplayId}_Flight_Report.pdf`);
}

/**
 * Open a beautifully formatted printable HTML preview window with headers & footers
 * and automatic print dialog ("Save as PDF").
 */
export function printFlightReportHtml(summary: FlightSummaryResponse) {
  const { flight, kpis, total_duration_minutes, timeline_phases, parameters, events } = summary;

  const fNumStr = flight.flight_number !== undefined ? String(flight.flight_number).padStart(3, '0') : '001';
  const acName = flight.aircraft_number ? `AC${flight.aircraft_number}` : (flight.aircraft_id ? `AC${flight.aircraft_id}` : 'AC');
  const flightDisplayId = `${acName}_${fNumStr}`;
  const nowStr = new Date().toLocaleString('en-GB');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // If popup blocked, fallback to downloadFlightPdf
    downloadFlightPdf(summary);
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${flightDisplayId} - Flight Test Diagnostics Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 12mm 15mm 12mm;
      @bottom-right {
        content: counter(page) " / " counter(pages);
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
      background: #fff;
    }
    .no-print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #fff;
      padding: 10px 20px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .no-print-bar button {
      background: #2563eb;
      color: #fff;
      border: 0;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      margin-left: 10px;
    }
    .no-print-bar button.secondary {
      background: #475569;
    }
    @media print {
      .no-print-bar { display: none !important; }
      body { padding: 0; }
    }
    .report-wrap {
      padding: 10px 14px 20px;
    }
    .header-banner {
      background: #184c78;
      color: #fff;
      padding: 14px 18px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .header-banner h1 {
      margin: 0 0 4px 0;
      font-size: 17px;
      letter-spacing: -0.01em;
    }
    .header-banner p {
      margin: 0;
      font-size: 11px;
      opacity: 0.9;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #184c78;
      border-bottom: 2px solid #cbd5e1;
      padding-bottom: 4px;
      margin: 18px 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10.5px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #0f172a;
    }
    .meta-table th {
      width: 20%;
      background: #f8fafc;
      color: #475569;
    }
    .meta-table td {
      width: 30%;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 9.5px;
    }
    .pill-complete { background: #dcfce7; color: #166534; }
    .pill-pending { background: #fef3c7; color: #92400e; }
    .footer-note {
      margin-top: 25px;
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div><b>Flight Test Diagnostics Report</b> · ${flightDisplayId}</div>
    <div>
      <button class="secondary" onclick="window.close()">Close Preview</button>
      <button onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>

  <div class="report-wrap">
    <div class="header-banner">
      <div>
        <h1>Smart Flight Test Analytics Dashboard (SFTAD)</h1>
        <p>Aeronautical Research and Development Centre (ARDC) / C-DAC</p>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 700; font-size: 14px;">${flightDisplayId}</div>
        <p>Generated: ${nowStr}</p>
      </div>
    </div>

    <div class="section-title">Flight Overview Details</div>
    <table class="meta-table">
      <tr>
        <th>Flight ID</th>
        <td><b>${flightDisplayId}</b> (System ID: ${flight.flight_id})</td>
        <th>Aircraft</th>
        <td>${acName}</td>
      </tr>
      <tr>
        <th>Flight Date/Time</th>
        <td>${formatDateTime(flight.flight_date_time)}</td>
        <th>Status</th>
        <td><span class="pill pill-complete">${flight.status || 'UNKNOWN'}</span></td>
      </tr>
      <tr>
        <th>Configured Mass</th>
        <td>${flight.configured_mass_kg ? flight.configured_mass_kg.toLocaleString() + ' kg' : '—'}</td>
        <th>Initial Fuel Loaded</th>
        <td>${flight.initial_fuel_kg ? flight.initial_fuel_kg.toLocaleString() + ' kg' : '—'}</td>
      </tr>
      <tr>
        <th>All-Up Initial Mass</th>
        <td>${flight.initial_mass_kg ? flight.initial_mass_kg.toLocaleString() + ' kg' : '—'}</td>
        <th>Total Duration</th>
        <td>${total_duration_minutes.toFixed(2)} min</td>
      </tr>
      <tr>
        <th>Ingestion Window</th>
        <td colspan="3">${formatDateTime(flight.upload_start_time)} to ${formatDateTime(flight.upload_end_time)}</td>
      </tr>
      ${flight.error_message ? `<tr><th>Remarks/Errors</th><td colspan="3" style="color: #b91c1c;">${flight.error_message}</td></tr>` : ''}
    </table>

    <div class="section-title">Key Performance Indicators</div>
    <table>
      <thead>
        <tr>
          <th>KPI Metric</th>
          <th>Measured Value</th>
          <th>Limit Evaluation</th>
          <th>Benchmark Limit</th>
        </tr>
      </thead>
      <tbody>
        ${kpis.map((k) => `
          <tr>
            <td><b>${k.title}</b></td>
            <td>${k.value !== null && k.value !== undefined ? k.value.toLocaleString() + ' ' + k.unit : '—'}</td>
            <td>${k.limit_text}</td>
            <td>${k.benchmark || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${timeline_phases && timeline_phases.length > 0 ? `
      <div class="section-title">Mission Timeline Phases</div>
      <table>
        <thead>
          <tr>
            <th>Phase ID</th>
            <th>Name</th>
            <th>Start Time</th>
            <th>End Time</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${timeline_phases.map((p) => `
            <tr>
              <td>${p.id.toUpperCase()}</td>
              <td>${p.name}</td>
              <td>${p.start_time}</td>
              <td>${p.end_time}</td>
              <td>${p.duration_min.toFixed(2)} min</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <div class="section-title">Flight Telemetry Parameters (${parameters.length})</div>
    <table>
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Parameter Name</th>
          <th>Description</th>
          <th>Value</th>
          <th>Unit</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${parameters.map((p, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><b>${p.param_name}</b></td>
            <td>${p.description || '—'}</td>
            <td><b>${p.value !== null && p.value !== undefined ? p.value : '—'}</b></td>
            <td>${p.unit || '—'}</td>
            <td><span class="pill ${p.status === 1 ? 'pill-complete' : 'pill-pending'}">${p.status_label || (p.status === 1 ? 'Complete' : 'Incomplete')}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-title">Detected Flight Events (${events.length})</div>
    <table>
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Event Name</th>
          <th>Occurrence Seq</th>
          <th>Timestamp (Date & Time)</th>
        </tr>
      </thead>
      <tbody>
        ${events.map((e, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><b>${e.event_name}</b></td>
            <td>${e.occur_seq !== null && e.occur_seq !== undefined ? e.occur_seq : '—'}</td>
            <td>${formatDateTime(e.date_time)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer-note">
      <span>SMART FLIGHT TEST ANALYTICS DASHBOARD · ARDC / C-DAC CONFIDENTIAL</span>
      <span>Flight: ${flightDisplayId} · Page 1</span>
    </div>
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
