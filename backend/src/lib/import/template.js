import ExcelJS from 'exceljs';

// A template the user can fill in directly: headers in the order the parser
// expects, one example row to show the format, and a locked sheet explaining
// the rules. Only the data sheet is editable.
export const buildTemplate = async (importer) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AMIS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Data');

  sheet.columns = importer.columns.map(column => ({
    header: column.header,
    key: column.key,
    width: Math.max(14, column.header.length + 4),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  headerRow.eachCell((cell, index) => {
    const column = importer.columns[index - 1];
    cell.note = column.required ? 'Required' : 'Optional';
  });
  headerRow.commit();

  sheet.addRow(Object.fromEntries(importer.columns.map(column => [column.key, column.example])));
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const notes = workbook.addWorksheet('Instructions');
  notes.columns = [{ width: 100 }];
  notes.addRow([`AMIS ${importer.label} import`]).font = { bold: true, size: 14 };
  notes.addRow([]);
  notes.addRow(['Delete the grey example row before uploading.']);
  notes.addRow(['Do not rename, reorder or remove the header row on the Data sheet.']);
  notes.addRow([]);
  notes.addRow(['Columns']).font = { bold: true };
  for (const column of importer.columns) {
    notes.addRow([`${column.header} - ${column.required ? 'required' : 'optional'}. Example: ${column.example}`]);
  }
  notes.addRow([]);
  notes.addRow(['Rules']).font = { bold: true };
  for (const line of importer.instructions) {
    notes.addRow([line]);
  }

  notes.eachRow(row => {
    row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' }; });
  });

  // Instructions are reference material, so lock them against accidental edits.
  await notes.protect('amis', { selectLockedCells: true, selectUnlockedCells: true });

  return workbook.xlsx.writeBuffer();
};
