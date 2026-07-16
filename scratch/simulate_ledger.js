// simulate_ledger.js
// Simulate the full double-entry bookkeeping for the exercise.

const accounts = {
  "1112": { name: "المباني والإنشاءات", debit: 400000, credit: 0 },
  "1113": { name: "الآلات والمعدات", debit: 150000, credit: 0 },
  "11193": { name: "مجمع إهلاك الآلات", debit: 0, credit: 30000 },
  "1114": { name: "وسائل النقل (السيارات)", debit: 100000, credit: 0 },
  "11194": { name: "مجمع إهلاك السيارات", debit: 0, credit: 20000 },
  "112": { name: "استثمارات مالية", debit: 120000, credit: 0 },
  "1231": { name: "النقدية بالصندوق (الرئيسية)", debit: 50000, credit: 0 },
  "123201": { name: "البنك الأهلي المصري", debit: 200000, credit: 0 },
  "123202": { name: "بنك مصر", debit: 100000, credit: 0 },
  "1225": { name: "مخصص ديون مشكوك فيها", debit: 0, credit: 5000 },
  "10301": { name: "مخزن المواد الخام", debit: 466000, credit: 0 },
  "1221": { name: "العملاء (يوسف)", debit: 82800, credit: 0 },
  "201": { name: "الموردين (الشركة الدولية)", debit: 0, credit: 277100 },
  "222": { name: "أوراق الدفع (شيكات صادرة)", debit: 0, credit: 105000 },
  "311": { name: "رأس المال المدفوع", debit: 0, credit: 1231700 },

  // Temporary/Operating accounts
  "10302": { name: "مخزن المنتج التام", debit: 0, credit: 0 },
  "411": { name: "المبيعات", debit: 0, credit: 0 },
  "412": { name: "مردودات المبيعات", debit: 0, credit: 0 },
  "511": { name: "تكلفة البضاعة المباعة", debit: 0, credit: 0 },
  "512": { name: "مصروفات الرواتب والأجور", debit: 0, credit: 0 },
  "513": { name: "مصروف إهلاك الآلات والمعدات", debit: 0, credit: 0 },
  "514": { name: "مصروف إهلاك السيارات", debit: 0, credit: 0 },
  "223": { name: "رواتب مستحقة", debit: 0, credit: 0 },
  "224": { name: "مصلحة الضرائب (كسب عمل)", debit: 0, credit: 0 },
  "1226": { name: "عهود وسلف موظفين", debit: 0, credit: 0 }
};

function journalEntry(date, desc, lines) {
  // Validate balance
  let sumDebit = 0;
  let sumCredit = 0;
  lines.forEach(l => {
    sumDebit += l.debit || 0;
    sumCredit += l.credit || 0;
  });
  if (Math.abs(sumDebit - sumCredit) > 0.01) {
    console.error(`Unbalanced JE on ${date} (${desc}): Dr=${sumDebit}, Cr=${sumCredit}`);
    return;
  }
  lines.forEach(l => {
    if (!accounts[l.acc]) {
      accounts[l.acc] = { name: l.name || "Unknown", debit: 0, credit: 0 };
    }
    accounts[l.acc].debit += l.debit || 0;
    accounts[l.acc].credit += l.credit || 0;
  });
}

// 1. Jan 10: Purchase of raw materials from supplier
// Note: We use the mathematically correct total 979,500 EGP
journalEntry("2026-01-10", "شراء مواد خام بالأجل من الشركة الدولية", [
  { acc: "10301", debit: 979500 },
  { acc: "201", credit: 979500 }
]);

// 2. Jan 15: Transportation of raw materials paid in cash
journalEntry("2026-01-15", "دفع مصاريف نقل مشتريات نقداً", [
  { acc: "10301", debit: 5000 },
  { acc: "1231", credit: 5000 }
]);

// 3. Feb 01: Sulafeh (loan) paid to Ahmad from cash box
journalEntry("2026-02-01", "صرف سلفة للموظف أحمد نقداً من الصندوق", [
  { acc: "1226", debit: 2000 },
  { acc: "1231", credit: 2000 }
]);

// 4. Feb 15: Manufacturing of 120 units of FG-100
// Material cost: 783,600 EGP (Scenario 3)
journalEntry("2026-02-15", "صرف خامات وتصنيع 120 وحدة تام الصنع", [
  { acc: "10302", debit: 783600 },
  { acc: "10301", credit: 783600 }
]);

// 5. Mar 01: Sales of 80 units to yusuf at 8,500 EGP each
// Revenue = 80 * 8,500 = 680,000 EGP
// Payment: 50,000 EGP by bank cheque (deferred in yusuf's receivable), rest on account
journalEntry("2026-03-01", "بيع 80 جهاز حاسوب للعميل يوسف", [
  { acc: "1221", debit: 680000 },
  { acc: "411", credit: 680000 }
]);

// COGS of 80 units sold (80 * 6,530 = 522,400)
journalEntry("2026-03-01", "إثبات تكلفة البضاعة المباعة لـ 80 جهاز", [
  { acc: "511", debit: 522400 },
  { acc: "10302", credit: 522400 }
]);

// 6. Mar 20: Return of 2 units from yusuf
// Revenue return = 2 * 8500 = 17,000 EGP
journalEntry("2026-03-20", "مرتجع مبيعات جهازين من العميل يوسف", [
  { acc: "412", debit: 17000 },
  { acc: "1221", credit: 17000 }
]);

// COGS return of 2 units (2 * 6,530 = 13,060)
journalEntry("2026-03-20", "إرجاع تكلفة البضاعة المباعة لجهازين للمخزن", [
  { acc: "10302", debit: 13060 },
  { acc: "511", credit: 13060 }
]);

// 7. June 30: Payroll for June
// Gross Salaries = 38,000 + 3,000 = 41,000 EGP
// Deductions: Loan Ahmad (2,000), Penalty (500), Tax (1,200)
// Net Salary payable = 41,000 - 3,700 = 37,300 EGP
journalEntry("2026-06-30", "إثبات رواتب شهر يونيو والاستقطاعات", [
  { acc: "512", debit: 40500 }, // Net payroll expense: 38,000 + 3,000 - 500
  { acc: "1226", credit: 2000 }, // Deduct loan Ahmad
  { acc: "224", credit: 1200 }, // Tax liability
  { acc: "223", credit: 37300 } // Net payable
]);

// Payment of net salaries from National Bank of Egypt
journalEntry("2026-06-30", "صرف صافي الرواتب بشيك من البنك الأهلي", [
  { acc: "223", debit: 37300 },
  { acc: "123201", credit: 37300 }
]);

// 8. July 01: Purchase of new car
// Car cost = 150,000 EGP, paid by check from Banque Misr
journalEntry("2026-07-01", "شراء سيارة نقل جديدة بشيك من بنك مصر", [
  { acc: "1114", debit: 150000 },
  { acc: "123202", credit: 150000 }
]);

// 9. July 25: Collection of yusuf's cheque (50,000 EGP) into Banque Misr
journalEntry("2026-07-25", "تحصيل شيك العميل يوسف وإيداعه في بنك مصر", [
  { acc: "123202", debit: 50000 },
  { acc: "1221", credit: 50000 }
]);

// 10. July 28: Payment to supplier (100,000 EGP) from NBE bank transfer
journalEntry("2026-07-28", "سداد دفعة للمورد الشركة الدولية من البنك الأهلي", [
  { acc: "201", debit: 100000 },
  { acc: "123201", credit: 100000 }
]);

// 11. July 30: Write off bad debt of yusuf (3,000 EGP) against provision
journalEntry("2026-07-30", "شطب دين معدوم للعميل يوسف من المخصص", [
  { acc: "1225", debit: 3000 },
  { acc: "1221", credit: 3000 }
]);

// 12. July 31: Depreciation adjustments
journalEntry("2026-07-31", "إثبات مصروف إهلاك الآلات والسيارات", [
  { acc: "513", debit: 15000 },
  { acc: "514", debit: 25000 },
  { acc: "11193", credit: 15000 },
  { acc: "11194", credit: 25000 }
]);

// Display trial balance
console.log("=== TRIAL BALANCE (July 31, 2026) ===");
let totalDr = 0;
let totalCr = 0;
Object.keys(accounts).forEach(code => {
  const acc = accounts[code];
  const bal = acc.debit - acc.credit;
  let dr = bal > 0 ? bal : 0;
  let cr = bal < 0 ? -bal : 0;
  totalDr += dr;
  totalCr += cr;
  if (dr > 0 || cr > 0) {
    console.log(`${code.padEnd(6)} | ${acc.name.padEnd(25)} | Dr=${dr.toFixed(2).padStart(10)} | Cr=${cr.toFixed(2).padStart(10)}`);
  }
});
console.log(`TOTAL  | ${"".padEnd(25)} | Dr=${totalDr.toFixed(2).padStart(10)} | Cr=${totalCr.toFixed(2).padStart(10)}`);
