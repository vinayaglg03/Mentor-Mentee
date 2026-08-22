import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import config from '../../config.js';

export const COLOURS = {
  ink: '#111827',
  muted: '#6b7280',
  rule: '#d1d5db',
  accent: '#1d4ed8',
  danger: '#b91c1c',
  warning: '#b45309',
  ok: '#047857',
};

export const PAGE = { margin: 42 };

export const createDocument = ({ title, subject }) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    info: { Title: title, Author: config.college.name, Subject: subject || title },
  });

  return doc;
};

export const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

// College name, optional logo and the report title. Read from config so a
// deployment can brand its own reports without a code change.
export const drawLetterhead = (doc, { title, subtitle }) => {
  const { name, address, department, logoPath } = config.college;
  const left = doc.page.margins.left;
  const top = doc.page.margins.top;
  let textLeft = left;

  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, left, top, { fit: [48, 48] });
      textLeft = left + 60;
    } catch {
      // A broken logo must never stop a report being produced.
    }
  }

  doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(15).text(name, textLeft, top);

  const details = [department, address].filter(Boolean).join(' · ');
  if (details) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOURS.muted).text(details, textLeft, doc.y + 1);
  }

  doc.moveDown(0.8);
  doc.fillColor(COLOURS.ink).font('Helvetica-Bold').fontSize(13).text(title, left, doc.y);

  if (subtitle) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLOURS.muted).text(subtitle);
  }

  doc.moveDown(0.5);
  rule(doc);
  doc.moveDown(0.6);
  doc.fillColor(COLOURS.ink);
};

export const rule = (doc, colour = COLOURS.rule) => {
  const left = doc.page.margins.left;
  doc.save()
    .strokeColor(colour)
    .lineWidth(0.75)
    .moveTo(left, doc.y)
    .lineTo(left + contentWidth(doc), doc.y)
    .stroke()
    .restore();
};

export const sectionHeading = (doc, text) => {
  ensureSpace(doc, 40);
  doc.moveDown(0.7);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOURS.accent).text(text.toUpperCase(), { characterSpacing: 0.4 });
  doc.moveDown(0.25);
  rule(doc);
  doc.moveDown(0.4);
  doc.fillColor(COLOURS.ink).font('Helvetica').fontSize(9.5);
};

// Adds a page when the next block would not fit, so tables never run off the
// bottom of a printed page.
export const ensureSpace = (doc, needed) => {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
    return true;
  }
  return false;
};

export const labelledFields = (doc, fields, columns = 2) => {
  const width = contentWidth(doc) / columns;
  const startX = doc.page.margins.left;
  let y = doc.y;

  fields.forEach((field, index) => {
    const column = index % columns;
    if (column === 0 && index > 0) y += 26;

    const x = startX + (column * width);
    doc.font('Helvetica').fontSize(8).fillColor(COLOURS.muted).text(field.label.toUpperCase(), x, y, { width: width - 10 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOURS.ink).text(field.value ?? '—', x, y + 11, { width: width - 10 });
  });

  doc.y = y + 30;
  doc.x = startX;
};

// Minimal fixed-column table. `columns` is [{ header, width, align, key }].
export const table = (doc, { columns, rows, emptyText = 'Nothing recorded.' }) => {
  const left = doc.page.margins.left;
  const totalWidth = contentWidth(doc);
  const widths = columns.map(column => (column.width / 100) * totalWidth);

  const header = () => {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOURS.muted);
    let x = left;
    columns.forEach((column, index) => {
      doc.text(column.header.toUpperCase(), x, y, { width: widths[index] - 6, align: column.align || 'left' });
      x += widths[index];
    });
    doc.y = y + 13;
    rule(doc);
    doc.moveDown(0.3);
  };

  header();

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOURS.muted).text(emptyText, left, doc.y);
    doc.fillColor(COLOURS.ink).font('Helvetica');
    doc.moveDown(0.5);
    return;
  }

  for (const row of rows) {
    if (ensureSpace(doc, 24)) header();

    const y = doc.y;
    let x = left;
    let height = 12;

    columns.forEach((column, index) => {
      const value = row[column.key];
      const text = value === null || value === undefined || value === '' ? '—' : String(value);
      doc.font(column.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .fillColor(row.colour || COLOURS.ink)
        .text(text, x, y, { width: widths[index] - 6, align: column.align || 'left' });

      height = Math.max(height, doc.y - y);
      x += widths[index];
    });

    doc.y = y + height + 4;
  }

  doc.fillColor(COLOURS.ink).font('Helvetica');
};

// A small vector line chart - pdfkit has no charting, and pulling in a
// headless browser to draw one would cost far more than it is worth.
export const lineChart = (doc, { series, labels, max = 10, height = 150 }) => {
  const left = doc.page.margins.left;
  const width = contentWidth(doc);
  const top = doc.y;
  const plotLeft = left + 28;
  const plotWidth = width - 36;
  const plotBottom = top + height - 18;
  const plotHeight = height - 28;

  ensureSpace(doc, height + 20);

  doc.save();

  // Horizontal gridlines every 2 grade points.
  for (let value = 0; value <= max; value += 2) {
    const y = plotBottom - (value / max) * plotHeight;
    doc.strokeColor('#eef2f7').lineWidth(0.6).moveTo(plotLeft, y).lineTo(plotLeft + plotWidth, y).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(COLOURS.muted).text(String(value), left, y - 3.5, { width: 22, align: 'right' });
  }

  const step = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;

  labels.forEach((label, index) => {
    const x = plotLeft + (index * step);
    doc.font('Helvetica').fontSize(7).fillColor(COLOURS.muted)
      .text(label, x - 18, plotBottom + 5, { width: 36, align: 'center' });
  });

  for (const line of series) {
    const points = line.values
      .map((value, index) => (value === null || value === undefined
        ? null
        : { x: plotLeft + (index * step), y: plotBottom - (Math.min(value, max) / max) * plotHeight }))
      .filter(Boolean);

    if (points.length === 0) continue;

    doc.strokeColor(line.colour).lineWidth(1.4);
    if (line.dashed) doc.dash(4, { space: 3 });

    points.forEach((point, index) => {
      if (index === 0) doc.moveTo(point.x, point.y);
      else doc.lineTo(point.x, point.y);
    });
    doc.stroke();
    doc.undash();

    for (const point of points) {
      doc.circle(point.x, point.y, 2).fillColor(line.colour).fill();
    }
  }

  doc.restore();

  // Legend.
  let legendX = plotLeft;
  const legendY = top + height - 2;
  for (const line of series) {
    doc.save().circle(legendX + 3, legendY + 3, 3).fillColor(line.colour).fill().restore();
    doc.font('Helvetica').fontSize(8).fillColor(COLOURS.muted).text(line.label, legendX + 10, legendY, { width: 60 });
    legendX += 70;
  }

  doc.y = legendY + 16;
  doc.x = left;
  doc.fillColor(COLOURS.ink);
};

// Page numbers and a generated-on stamp, added once the body is complete.
export const finalise = (doc, { footerNote } = {}) => {
  const range = doc.bufferedPageRange();
  const generated = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);

    const y = doc.page.height - doc.page.margins.bottom + 12;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOURS.muted);
    doc.text(
      footerNote ? `${footerNote} · Generated ${generated}` : `Generated ${generated}`,
      doc.page.margins.left,
      y,
      { width: contentWidth(doc) - 60, align: 'left', lineBreak: false }
    );
    doc.text(
      `Page ${index - range.start + 1} of ${range.count}`,
      doc.page.margins.left,
      y,
      { width: contentWidth(doc), align: 'right', lineBreak: false }
    );
  }

  doc.flushPages();
};

// Signature block: a mentoring report is a document that gets signed and filed.
export const signatures = (doc, names) => {
  ensureSpace(doc, 80);
  doc.moveDown(2);

  const width = contentWidth(doc) / names.length;
  const y = doc.y + 24;

  names.forEach((name, index) => {
    const x = doc.page.margins.left + (index * width);
    doc.save().strokeColor(COLOURS.rule).lineWidth(0.75)
      .moveTo(x, y).lineTo(x + width - 30, y).stroke().restore();
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOURS.muted).text(name, x, y + 5, { width: width - 30 });
  });

  doc.y = y + 22;
};

export const streamToResponse = (doc, res, fileName) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  doc.pipe(res);
  doc.end();
};
