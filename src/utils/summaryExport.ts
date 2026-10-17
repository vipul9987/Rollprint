import {
  FLEX_SUMMARY_WIDTHS,
  VINYL_SUMMARY_WIDTHS,
  PVC_THICKNESSES
} from '../data/inventoryStore';
import { MatrixItemWithStock } from '../types/inventory';

export interface SummaryTablesExportData {
  flexRows: Array<{
    materialName: string;
    category: string;
    cells: { [width: string]: MatrixItemWithStock | undefined };
    totalRolls: number;
    totalAreaMtr2: number;
  }>;
  flexColTotals: { [width: string]: number };
  flexGrandTotalRolls: number;
  flexGrandTotalArea: number;
  vinylRows: Array<{
    materialName: string;
    category: string;
    cells: { [width: string]: MatrixItemWithStock | undefined };
    totalRolls: number;
    totalAreaMtr2: number;
  }>;
  vinylColTotals: { [width: string]: number };
  vinylGrandTotalRolls: number;
  vinylGrandTotalArea: number;
  hasPvc: boolean;
  pvcRows: Array<{
    sheetSize: string;
    materialName: string;
    cells: { [thickness: string]: MatrixItemWithStock | undefined };
    totalSheets: number;
    totalAreaMtr2: number;
  }>;
  pvcColTotals: { [thickness: string]: number };
  pvcGrandTotalSheets: number;
  pvcGrandTotalArea: number;
}

function escapeCsvField(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Excel-ready CSV string for the entire Summary Matrix
 * (Flex / Backlit, Vinyl / Lamination, PVC Rigid Sheets).
 */
export function generateSummaryCsv(data: SummaryTablesExportData): string {
  const lines: string[] = [];

  // Table 1: Flex / Backlit Roll Stock
  lines.push('TABLE 1: FLEX / BACKLIT ROLL STOCK');
  const flexHeader = [
    'Material Name',
    'Category',
    ...FLEX_SUMMARY_WIDTHS.map((w) => `${w} M`),
    'Total Rolls',
    'Total Area (m²)'
  ];
  lines.push(flexHeader.map(escapeCsvField).join(','));

  data.flexRows.forEach((row) => {
    const rowFields = [
      row.materialName,
      row.category,
      ...FLEX_SUMMARY_WIDTHS.map((w) => row.cells[w]?.currentStock ?? 0),
      row.totalRolls,
      row.totalAreaMtr2
    ];
    lines.push(rowFields.map(escapeCsvField).join(','));
  });

  const flexTotalsRow = [
    'TOTAL ROLLS',
    '',
    ...FLEX_SUMMARY_WIDTHS.map((w) => data.flexColTotals[w] ?? 0),
    data.flexGrandTotalRolls,
    data.flexGrandTotalArea
  ];
  lines.push(flexTotalsRow.map(escapeCsvField).join(','));

  // Spacer
  lines.push('');
  lines.push('');

  // Table 2: Vinyl / Lamination Roll Stock
  lines.push('TABLE 2: VINYL / LAMINATION ROLL STOCK');
  const vinylHeader = [
    'Material Name',
    'Category',
    ...VINYL_SUMMARY_WIDTHS.map((w) => `${w} M`),
    'Total Rolls',
    'Total Area (m²)'
  ];
  lines.push(vinylHeader.map(escapeCsvField).join(','));

  data.vinylRows.forEach((row) => {
    const rowFields = [
      row.materialName,
      row.category,
      ...VINYL_SUMMARY_WIDTHS.map((w) => row.cells[w]?.currentStock ?? 0),
      row.totalRolls,
      row.totalAreaMtr2
    ];
    lines.push(rowFields.map(escapeCsvField).join(','));
  });

  const vinylTotalsRow = [
    'TOTAL ROLLS',
    '',
    ...VINYL_SUMMARY_WIDTHS.map((w) => data.vinylColTotals[w] ?? 0),
    data.vinylGrandTotalRolls,
    data.vinylGrandTotalArea
  ];
  lines.push(vinylTotalsRow.map(escapeCsvField).join(','));

  // Table 3: PVC Foam Sheet Stock (if present)
  if (data.hasPvc && data.pvcRows.length > 0) {
    lines.push('');
    lines.push('');
    lines.push('TABLE 3: PVC / RIGID SHEET STOCK');
    const pvcHeader = [
      'Sheet Size',
      'Material Name',
      ...PVC_THICKNESSES,
      'Total Sheets',
      'Total Area (m²)'
    ];
    lines.push(pvcHeader.map(escapeCsvField).join(','));

    data.pvcRows.forEach((row) => {
      const rowFields = [
        row.sheetSize,
        row.materialName,
        ...PVC_THICKNESSES.map((th) => row.cells[th]?.currentStock ?? 0),
        row.totalSheets,
        row.totalAreaMtr2
      ];
      lines.push(rowFields.map(escapeCsvField).join(','));
    });

    const pvcTotalsRow = [
      'TOTAL SHEETS',
      '',
      ...PVC_THICKNESSES.map((th) => data.pvcColTotals[th] ?? 0),
      data.pvcGrandTotalSheets,
      data.pvcGrandTotalArea
    ];
    lines.push(pvcTotalsRow.map(escapeCsvField).join(','));
  }

  return lines.join('\r\n');
}

/**
 * Downloads the summary CSV file with UTF-8 BOM for Microsoft Excel & Google Sheets compatibility.
 */
export function downloadSummaryCsvFile(data: SummaryTablesExportData): void {
  const csvContent = generateSummaryCsv(data);
  // Prepend UTF-8 BOM \uFEFF for Excel compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `RollPrint_Summary_Stock_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates TSV (Tab Separated Values) for 1-click clipboard paste directly into Google Sheets.
 */
export function copySummaryTsvForGoogleSheets(data: SummaryTablesExportData): Promise<void> {
  const lines: string[] = [];

  // Table 1: Flex / Backlit
  lines.push('1. FLEX / BACKLIT ROLL STOCK');
  lines.push(['Material', 'Category', ...FLEX_SUMMARY_WIDTHS.map((w) => `${w} M`), 'Total Rolls', 'Total Area (m²)'].join('\t'));
  data.flexRows.forEach((row) => {
    lines.push([
      row.materialName,
      row.category,
      ...FLEX_SUMMARY_WIDTHS.map((w) => row.cells[w]?.currentStock ?? 0),
      row.totalRolls,
      row.totalAreaMtr2
    ].join('\t'));
  });
  lines.push(['TOTAL ROLLS', '', ...FLEX_SUMMARY_WIDTHS.map((w) => data.flexColTotals[w] ?? 0), data.flexGrandTotalRolls, data.flexGrandTotalArea].join('\t'));

  lines.push('');
  // Table 2: Vinyl
  lines.push('2. VINYL / LAMINATION ROLL STOCK');
  lines.push(['Material', 'Category', ...VINYL_SUMMARY_WIDTHS.map((w) => `${w} M`), 'Total Rolls', 'Total Area (m²)'].join('\t'));
  data.vinylRows.forEach((row) => {
    lines.push([
      row.materialName,
      row.category,
      ...VINYL_SUMMARY_WIDTHS.map((w) => row.cells[w]?.currentStock ?? 0),
      row.totalRolls,
      row.totalAreaMtr2
    ].join('\t'));
  });
  lines.push(['TOTAL ROLLS', '', ...VINYL_SUMMARY_WIDTHS.map((w) => data.vinylColTotals[w] ?? 0), data.vinylGrandTotalRolls, data.vinylGrandTotalArea].join('\t'));

  if (data.hasPvc && data.pvcRows.length > 0) {
    lines.push('');
    lines.push('3. PVC / RIGID SHEET STOCK');
    lines.push(['Sheet Size', 'Material', ...PVC_THICKNESSES, 'Total Sheets', 'Total Area (m²)'].join('\t'));
    data.pvcRows.forEach((row) => {
      lines.push([
        row.sheetSize,
        row.materialName,
        ...PVC_THICKNESSES.map((th) => row.cells[th]?.currentStock ?? 0),
        row.totalSheets,
        row.totalAreaMtr2
      ].join('\t'));
    });
    lines.push(['TOTAL SHEETS', '', ...PVC_THICKNESSES.map((th) => data.pvcColTotals[th] ?? 0), data.pvcGrandTotalSheets, data.pvcGrandTotalArea].join('\t'));
  }

  const tsvText = lines.join('\n');
  return navigator.clipboard.writeText(tsvText);
}
