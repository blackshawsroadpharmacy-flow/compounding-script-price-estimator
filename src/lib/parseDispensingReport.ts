// Parser for the dispensing-software CSV report.
// Columns: Date, Script Number, Description, Price
// Dates are non-zero-padded D/M/YYYY (Australian day-first) — never US month-first.

export interface ParsedRow {
  script_number: string;
  dispensed_date: string | null; // ISO yyyy-mm-dd
  description: string;
  price: number;
  dosage_form: string | null;
  quantity: number | null;
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { line: number; reason: string; raw: string }[];
}

// Day-first parser. Returns ISO date or null.
export function parseDayFirstDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

// Minimal RFC-4180 CSV splitter — handles quoted fields with commas.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

const FORM_PATTERNS: { form: string; rx: RegExp }[] = [
  { form: "capsule", rx: /\bcapsule|capsules|caps\b/i },
  { form: "troche", rx: /\btroche|troches|lozenge|lozenges\b/i },
  { form: "pessary", rx: /\bpessar(y|ies)|suppositor(y|ies)\b/i },
  { form: "cream", rx: /\bcream|emp\b/i },
  { form: "ointment", rx: /\bointment\b/i },
  { form: "gel", rx: /\bgel\b/i },
  { form: "lotion", rx: /\blotion\b/i },
  { form: "foam", rx: /\bfoam\b/i },
  { form: "solution", rx: /\bsolution|liquid|mixture|drops|spray\b/i },
  { form: "suspension", rx: /\bsuspension\b/i },
  { form: "powder", rx: /\bpowder\b/i },
];

export function detectDosageForm(desc: string): string | null {
  for (const { form, rx } of FORM_PATTERNS) {
    if (rx.test(desc)) return form;
  }
  return null;
}

/**
 * Extract pack quantity from a description.
 *
 * Trap: trailing strengths like "100MG", "10MG" are NOT pack quantities.
 * Only treat as quantity:
 *  - explicit "x N" / "× N" / "N pack" / "Pack of N"
 *  - units of mass/volume attached to numbers: "30G", "100ML", "50GM" (form-dependent)
 *  - bare trailing integer when no unit is attached AND form is countable
 *    (capsule, troche, pessary)
 */
export function extractQuantity(desc: string, form: string | null): { qty: number | null; warning?: string } {
  const d = desc.trim();

  // 1) Explicit "x N" or "× N"
  const xMatch = d.match(/(?:^|\s)[x×]\s*(\d{1,4})\b/i);
  if (xMatch) return { qty: parseInt(xMatch[1], 10) };

  // 2) "N Capsules" / "N Pessaries" / "N Troches" / "Pack of N"
  const packMatch = d.match(/\b(\d{1,4})\s*(?:capsules?|caps|troches?|pessar(?:y|ies)|lozenges?|suppositor(?:y|ies))\b/i);
  if (packMatch) return { qty: parseInt(packMatch[1], 10) };
  const packOf = d.match(/\bpack(?:\s*of)?\s*(\d{1,4})\b/i);
  if (packOf) return { qty: parseInt(packOf[1], 10) };

  // 3) Trailing weight/volume unit (creams/ointments/liquids)
  // Look for the LAST occurrence — strengths usually appear earlier mid-string.
  const massVol = [...d.matchAll(/(\d+(?:\.\d+)?)\s*(g|gm|ml|l|mg)\b/gi)];
  if (massVol.length) {
    const last = massVol[massVol.length - 1];
    const val = parseFloat(last[1]);
    const unit = last[2].toLowerCase();
    // Only treat as pack size if the unit matches the form (or no form is set).
    const isLiquid = form === "solution" || form === "suspension" || form === "lotion" || form === "foam";
    const isSemi = form === "cream" || form === "ointment" || form === "gel";
    if (unit === "g" || unit === "gm") {
      if (!form || isSemi) return { qty: val };
    } else if (unit === "ml" || unit === "l") {
      if (!form || isLiquid) return { qty: unit === "l" ? val * 1000 : val };
    }
    // "mg" is almost always a strength — never a pack size.
  }

  // 4) Bare trailing integer for countable forms — "Amantadine 100MG Capsules 100"
  if (form === "capsule" || form === "troche" || form === "pessary") {
    const tail = d.match(/(\d{1,4})\s*$/);
    if (tail) {
      // Ensure it's not glued to a unit (e.g. "10MG" — already excluded by \s*$ on digits, but check prior chars).
      const before = d.slice(0, tail.index).trimEnd();
      if (!/[a-z]$/i.test(before.slice(-1))) {
        const n = parseInt(tail[1], 10);
        // Capsule pack sizes usually 14–200; treat <14 as suspicious but accept.
        if (n >= 2 && n <= 500) return { qty: n };
      }
      return { qty: null, warning: "trailing-integer-ambiguous" };
    }
  }

  return { qty: null };
}

export function parseDispensingCsv(text: string): ParseResult {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: ParseResult = { rows: [], errors: [] };
  if (lines.length === 0) return result;
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    date: header.findIndex((h) => h === "date"),
    script: header.findIndex((h) => h.includes("script")),
    desc: header.findIndex((h) => h.includes("description")),
    price: header.findIndex((h) => h === "price"),
  };
  if (idx.date < 0 || idx.script < 0 || idx.desc < 0 || idx.price < 0) {
    result.errors.push({ line: 1, reason: "Header must contain Date, Script Number, Description, Price", raw: lines[0] });
    return result;
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const cols = splitCsvLine(raw);
    if (cols.length < 4) {
      result.errors.push({ line: i + 1, reason: "fewer than 4 columns", raw });
      continue;
    }
    const script = cols[idx.script]?.trim();
    const description = cols[idx.desc]?.trim().replace(/\s+/g, " ");
    const priceStr = cols[idx.price]?.trim();
    const dateStr = cols[idx.date]?.trim();
    if (!script) { result.errors.push({ line: i + 1, reason: "missing script number", raw }); continue; }
    if (!description) { result.errors.push({ line: i + 1, reason: "missing description", raw }); continue; }
    const price = parseFloat(priceStr);
    if (!isFinite(price)) { result.errors.push({ line: i + 1, reason: "invalid price", raw }); continue; }

    const dispensed_date = parseDayFirstDate(dateStr);
    const warnings: string[] = [];
    if (!dispensed_date && dateStr) warnings.push("unparseable-date");

    const form = detectDosageForm(description);
    const { qty, warning } = extractQuantity(description, form);
    if (warning) warnings.push(warning);

    result.rows.push({
      script_number: script,
      dispensed_date,
      description,
      price,
      dosage_form: form,
      quantity: qty,
      warnings,
    });
  }
  return result;
}
