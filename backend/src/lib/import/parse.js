import ExcelJS from 'exceljs';

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportError';
    this.status = 400;
  }
}

// Header text -> object key. Comparison ignores case, spaces and punctuation
// so "Roll Number", "roll_number" and "ROLLNUMBER" all match.
const normalise = (header) => String(header ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const cellValue = (value) => {
  if (value === null || value === undefined) return '';
  // exceljs returns objects for formulas, rich text, hyperlinks and dates.
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) return value.result ?? '';
    if ('text' in value) return value.text ?? '';
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('hyperlink' in value) return value.text ?? '';
    return '';
  }
  return value;
};

const trim = (value) => (typeof value === 'string' ? value.trim() : value);

const rowsFromWorksheet = (worksheet, columns) => {
  const headerRow = worksheet.getRow(1);
  const headerMap = new Map();

  headerRow.eachCell((cell, colNumber) => {
    const key = normalise(cellValue(cell.value));
    if (key) headerMap.set(colNumber, key);
  });

  const wanted = new Map(columns.map(column => [normalise(column.header), column.key]));

  const missing = columns
    .filter(column => column.required && ![...headerMap.values()].includes(normalise(column.header)))
    .map(column => column.header);

  if (missing.length > 0) {
    throw new ImportError(`The file is missing required column(s): ${missing.join(', ')}.`);
  }

  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = {};
    let hasValue = false;

    headerMap.forEach((headerKey, colNumber) => {
      const key = wanted.get(headerKey);
      if (!key) return;
      const value = trim(cellValue(row.getCell(colNumber).value));
      values[key] = value;
      if (value !== '' && value !== null && value !== undefined) hasValue = true;
    });

    // Skip rows that are entirely blank - spreadsheets are full of them.
    if (hasValue) rows.push({ rowNumber, values });
  });

  return rows;
};

// Returns [{ rowNumber, values }] where rowNumber is the spreadsheet row the
// user can actually look at.
export const parseSpreadsheet = async ({ buffer, fileName, columns }) => {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(fileName || '');

  try {
    if (isCsv) {
      const { Readable } = await import('node:stream');
      await workbook.csv.read(Readable.from(buffer.toString('utf8')));
    } else {
      await workbook.xlsx.load(buffer);
    }
  } catch {
    throw new ImportError('The file could not be read. Save it as .xlsx or .csv and try again.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) {
    throw new ImportError('The file has no data rows.');
  }

  return rowsFromWorksheet(worksheet, columns);
};
