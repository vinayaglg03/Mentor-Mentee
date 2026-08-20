import prisma from '../prismaClient.js';
import { getImporter } from '../lib/import/index.js';
import { parseSpreadsheet, ImportError } from '../lib/import/parse.js';
import { buildTemplate } from '../lib/import/template.js';
import { NotFoundError, ForbiddenError } from '../lib/access.js';

// A parsed file is held for this long between preview and commit.
const PENDING_TTL_MINUTES = 30;
const MAX_ROWS = 2000;

const importerOr404 = (type) => {
  const importer = getImporter(type);
  if (!importer) throw new NotFoundError('Unknown import type.');
  return importer;
};

const sweepExpired = () =>
  prisma.pendingImport.deleteMany({ where: { expiresAt: { lt: new Date() } } });

export const getTemplate = async (req, res, next) => {
  try {
    const importer = importerOr404(req.params.type);
    const buffer = await buildTemplate(importer);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="amis-${importer.type}-template.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    next(error);
  }
};

// Parses and validates the upload, stores it, and returns what would happen.
// Writes nothing to the domain tables.
export const preview = async (req, res, next) => {
  try {
    const importer = importerOr404(req.params.type);

    if (!req.file) {
      throw new ImportError('No file was uploaded.');
    }

    const fileName = req.file.originalname || 'upload.xlsx';
    if (!/\.(xlsx|csv)$/i.test(fileName)) {
      throw new ImportError('Only .xlsx and .csv files are supported.');
    }

    const parsed = await parseSpreadsheet({
      buffer: req.file.buffer,
      fileName,
      columns: importer.columns,
    });

    if (parsed.length === 0) {
      throw new ImportError('The file has no data rows.');
    }
    if (parsed.length > MAX_ROWS) {
      throw new ImportError(`The file has ${parsed.length} rows; the limit is ${MAX_ROWS} per import.`);
    }

    const { rows, errors } = await importer.validate({ rows: parsed, user: req.user, prisma });

    // Show what the user typed for every column, plus anything the importer
    // derived (student name, computed totals).
    const rawByRow = new Map(parsed.map(row => [row.rowNumber, row.values]));
    for (const row of rows) {
      row.display = { ...(rawByRow.get(row.rowNumber) || {}), ...(row.display || {}) };
    }

    const summary = {
      total: rows.length,
      toCreate: rows.filter(row => row.action === 'create').length,
      toUpdate: rows.filter(row => row.action === 'update').length,
      invalid: rows.filter(row => row.action === 'invalid').length,
    };

    await sweepExpired();

    const pending = await prisma.pendingImport.create({
      data: {
        type: importer.type,
        userId: req.user.id,
        fileName,
        summary,
        rows,
        expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000),
      },
      select: { id: true, expiresAt: true },
    });

    res.json({
      importId: pending.id,
      expiresAt: pending.expiresAt,
      fileName,
      columns: [
        ...importer.columns.map(({ key, header, required }) => ({ key, header, required })),
        ...(importer.previewExtras || []),
      ],
      rows,
      errors,
      summary,
    });
  } catch (error) {
    next(error);
  }
};

// Applies a previously previewed file in one transaction. All or nothing.
export const commit = async (req, res, next) => {
  try {
    const importer = importerOr404(req.params.type);
    const { importId } = req.body;

    const pending = await prisma.pendingImport.findUnique({ where: { id: importId } });

    if (!pending || pending.type !== importer.type) {
      throw new NotFoundError('That import is no longer available. Upload the file again.');
    }
    if (pending.userId !== req.user.id) {
      throw new ForbiddenError('That import belongs to another user.');
    }
    if (pending.expiresAt < new Date()) {
      await prisma.pendingImport.delete({ where: { id: pending.id } });
      throw new ImportError('That import has expired. Upload the file again.');
    }
    if (pending.summary.invalid > 0) {
      throw new ImportError(`The file still has ${pending.summary.invalid} invalid row(s). Fix them and upload again.`);
    }

    const result = await prisma.$transaction(
      (tx) => importer.commit({ rows: pending.rows, user: req.user, tx }),
      { timeout: 120000, maxWait: 15000 }
    );

    await prisma.pendingImport.delete({ where: { id: pending.id } });

    res.json({
      message: `${importer.label} imported successfully`,
      fileName: pending.fileName,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
