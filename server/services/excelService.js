import pkg from 'xlsx';
const { readFile, utils, writeFile, read } = pkg;

import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parses an uploaded Excel/CSV file and returns an array of raw domain strings.
 * cellFormula/cellHTML/cellNF disabled to prevent ReDoS via crafted formula cells.
 */
export function parseDomainsFromFile(filePath) {
  try {
    const workbook = readFile(filePath, {
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
    });

    const domains = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false
      });

      for (const row of rows) {
        for (const cell of row) {
          if (cell && typeof cell === 'string') {
            const trimmed = cell.trim();
            if (trimmed) domains.push(trimmed);
          }
        }
      }
    }

    return domains;
  } catch (err) {
    logger.error(`Excel parse error for ${filePath}: ${err.message}`);
    throw new Error(`Failed to parse file: ${err.message}`);
  }
}

/**
 * Generates a downloadable Excel results file from job domain data.
 */
export function generateResultsExcel(jobId, domainResults, outputDir) {
  const rows = [['Domain', 'Emails', 'Status', 'Method', 'Error']];

  for (const item of domainResults) {
    rows.push([
      item.domain,
      (item.emails || []).join(', ') || '—',
      item.status,
      item.method || '—',
      item.error  || '—'
    ]);
  }

  const worksheet = utils.aoa_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 40 },
    { wch: 80 },
    { wch: 15 },
    { wch: 15 },
    { wch: 50 }
  ];

  ['A1', 'B1', 'C1', 'D1', 'E1'].forEach(cell => {
    if (worksheet[cell]) {
      worksheet[cell].s = { font: { bold: true } };
    }
  });

  const wb = utils.book_new();
  utils.book_append_sheet(wb, worksheet, 'Email Results');

  const filename = `results_${jobId}.xlsx`;
  const filePath = path.join(outputDir, filename);
  writeFile(wb, filePath);

  logger.info(`Results Excel written: ${filePath}`);
  return filename;
}