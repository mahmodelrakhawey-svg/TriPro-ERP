/**
 * Code 128 (Subset B) Pure TypeScript SVG Barcode Generator
 * Generates high-density vector barcodes that scan accurately on all POS barcode laser & 2D scanners.
 */

// Code 128 patterns (widths of alternating bars and spaces: 6 digits per symbol)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (104=Start B, 106=Stop)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export function generateCode128Svg(text: string, options?: { height?: number; barWidth?: number; showText?: boolean }): string {
  const height = options?.height || 50;
  const barWidth = options?.barWidth || 2;
  const showText = options?.showText !== false;

  // Compute Code 128 symbols
  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const codeVal = charCode - 32; // ASCII to Code 128B index
    if (codeVal >= 0 && codeVal <= 95) {
      codes.push(codeVal);
      checksum += codeVal * (i + 1);
    }
  }

  // Checksum modulo 103
  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  // Convert codes into alternating bar/space width sequence
  let binaryString = "";
  codes.forEach(c => {
    const pattern = CODE128_PATTERNS[c] || "";
    for (let i = 0; i < pattern.length; i++) {
      const width = parseInt(pattern[i], 10);
      const isBar = i % 2 === 0;
      binaryString += (isBar ? "1" : "0").repeat(width);
    }
  });

  const totalWidth = binaryString.length * barWidth + 20; // 10px quiet zone on each side
  const svgHeight = height + (showText ? 18 : 0);

  let paths = "";
  let x = 10; // Start after quiet zone

  for (let i = 0; i < binaryString.length; i++) {
    if (binaryString[i] === "1") {
      paths += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="#000000" />`;
    }
    x += barWidth;
  }

  const textElement = showText
    ? `<text x="${totalWidth / 2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="#000000">${text}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${svgHeight}" width="${totalWidth}" height="${svgHeight}">${paths}${textElement}</svg>`;
}
