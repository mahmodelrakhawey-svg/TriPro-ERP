// calculate_exercise_math.js
// Script to calculate the exact mathematical outcomes of the exercise under different scenarios.

const opening = {
  kisa: { qty: 62, price: 5000 },
  shasha: { qty: 100, price: 800 },
  hard: { qty: 106, price: 500 },
  mouse: { qty: 100, price: 100 },
  keyboard: { qty: 100, price: 90 },
  kabel: { qty: 100, price: 40 }
};

const purchase = {
  kisa: { qty: 150, price: 5000 },
  shasha: { qty: 150, price: 800 },
  hard: { qty: 150, price: 500 },
  mouse: { qty: 150, price: 100 },
  keyboard: { qty: 150, price: 90 },
  kabel: { qty: 150, price: 40 }
};

const totalPurchasedValue = Object.keys(purchase).reduce((sum, key) => sum + purchase[key].qty * purchase[key].price, 0);
const totalPurchasedQty = Object.keys(purchase).reduce((sum, key) => sum + purchase[key].qty, 0);
const shippingCost = 5000;

function runScenario(name, distributeShippingFn) {
  console.log(`=== SCENARIO: ${name} ===`);
  const items = {};
  
  // Calculate WAC for each item
  Object.keys(opening).map(key => {
    const oQty = opening[key].qty;
    const oVal = oQty * opening[key].price;
    
    const pQty = purchase[key].qty;
    const pValBase = pQty * purchase[key].price;
    const pShippingShare = distributeShippingFn(key, pQty, pValBase);
    const pVal = pValBase + pShippingShare;
    
    const totalQty = oQty + pQty;
    const totalVal = oVal + pVal;
    const wac = totalVal / totalQty;
    
    items[key] = {
      qty: totalQty,
      val: totalVal,
      wac: wac
    };
    
    console.log(`${key.padEnd(8)}: Qty=${totalQty}, TotalVal=${totalVal.toFixed(2)}, WAC=${wac.toFixed(4)}`);
  });
  
  // Consume 120 of each for manufacturing
  const consumedQty = 120;
  let totalMfgCost = 0;
  Object.keys(items).forEach(key => {
    const cost = consumedQty * items[key].wac;
    totalMfgCost += cost;
  });
  console.log(`Total Manufacturing Cost (120 units): ${totalMfgCost.toFixed(2)} EGP`);
  const unitMfgCost = totalMfgCost / 120;
  console.log(`Unit Cost of Finished Good (FG-100): ${unitMfgCost.toFixed(2)} EGP`);
  
  // Sale of 80 units at 8,500 EGP
  const saleQty = 80;
  const salePrice = 8500;
  const salesRevenue = saleQty * salePrice;
  const cogs = saleQty * unitMfgCost;
  
  // Sales return of 2 units
  const returnQty = 2;
  const returnedRevenue = returnQty * salePrice;
  const returnedCogs = returnQty * unitMfgCost;
  
  const netSalesRevenue = salesRevenue - returnedRevenue;
  const netCogs = cogs - returnedCogs;
  const grossProfit = netSalesRevenue - netCogs;
  
  console.log(`Net Revenue: ${netSalesRevenue.toFixed(2)} EGP`);
  console.log(`Net COGS: ${netCogs.toFixed(2)} EGP`);
  console.log(`Gross Profit: ${grossProfit.toFixed(2)} EGP`);
  
  // Expenses
  const basicSalaries = 38000;
  const bonuses = 3000;
  const penalties = 500; // reduces salary expense?
  const netSalaryExpense = basicSalaries + bonuses - penalties;
  
  const deprMachines = 15000;
  const deprCars = 25000;
  const totalDeprExpense = deprMachines + deprCars;
  
  const totalExpenses = netSalaryExpense + totalDeprExpense;
  const netProfit = grossProfit - totalExpenses;
  
  console.log(`Salary Expense: ${netSalaryExpense} EGP`);
  console.log(`Depreciation Expense: ${totalDeprExpense} EGP`);
  console.log(`Total Expenses: ${totalExpenses} EGP`);
  console.log(`Net Profit: ${netProfit.toFixed(2)} EGP\n`);
}

// Scenario 1: Shipping distributed by value
runScenario("Shipping distributed by Value", (key, qty, val) => {
  return (val / totalPurchasedValue) * shippingCost;
});

// Scenario 2: Shipping distributed by quantity (equally per unit)
runScenario("Shipping distributed by Quantity", (key, qty, val) => {
  return (qty / totalPurchasedQty) * shippingCost;
});

// Scenario 3: Shipping not capitalized (treated as expense or ignored in WAC)
runScenario("Shipping NOT Capitalized in WAC", (key, qty, val) => {
  return 0;
});
