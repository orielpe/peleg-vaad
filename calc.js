// Pure calculations. No DOM here, so it can be tested in Node.
(function (root) {
  const LEAD = 'הנהגה';

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  // Class share is rounded to the nearest half shekel; the leadership gets the rest,
  // so the two parts always add up to exactly what was collected.
  const roundHalf = (n) => Math.round(n * 2) / 2;

  // settings: rows [{הגדרה, ערך}] -> object
  function readSettings(rows) {
    const s = {};
    rows.forEach((r) => { if (r['הגדרה']) s[String(r['הגדרה']).trim()] = r['ערך']; });
    const classPct = num(s['אחוז לכיתה']) || 0.55;
    return {
      year: s['שנת לימודים'] || '',
      classPct: classPct > 1 ? classPct / 100 : classPct,
      leadPct: 1 - (classPct > 1 ? classPct / 100 : classPct),
      leadOriginal: num(s['תקציב הנהגה מקורי']),
    };
  }

  function readClasses(rows, settings) {
    return rows
      .filter((r) => r['כיתה'] && String(r['כיתה']).trim())
      .map((r) => {
        const students = num(r['תלמידים']);
        const perStudent = num(r['תשלום לתלמיד']);
        const income = num(r['נגבה בפועל']);
        const expected = students * perStudent;
        return {
          name: String(r['כיתה']).trim(),
          students, perStudent, income, expected,
          classShare: roundHalf(income * settings.classPct),
          leadShare: round2(income - roundHalf(income * settings.classPct)),
          expectedClassShare: roundHalf(expected * settings.classPct),
          expectedLeadShare: round2(expected - roundHalf(expected * settings.classPct)),
        };
      });
  }

  function readCategories(rows) {
    return rows
      .filter((r) => r['תקציב'] && r['סעיף'])
      .map((r) => ({
        budget: String(r['תקציב']).trim(),
        name: String(r['סעיף']).trim(),
        planned: num(r['תקציב מתוכנן']),
        notes: r['הערות'] ? String(r['הערות']) : '',
      }));
  }

  function readExpenses(rows) {
    return rows
      .filter((r) => r['תקציב'] && num(r['סכום']) !== 0)
      .map((r) => ({
        date: r['תאריך'] || '',
        dateSort: r._sort_תאריך || 0,
        budget: String(r['תקציב']).trim(),
        category: r['סעיף'] ? String(r['סעיף']).trim() : '',
        description: r['תיאור'] ? String(r['תיאור']) : '',
        amount: num(r['סכום']),
        paidBy: r['מי שילם'] ? String(r['מי שילם']) : '',
        reimbursed: String(r['הוחזר'] || '').trim() === 'כן',
        reimbursedDate: r['תאריך החזר'] || '',
        notes: r['הערות'] ? String(r['הערות']) : '',
      }));
  }

  // One budget (a class or the leadership): totals, planning table, expenses.
  function budgetView(budgetName, collected, categories, expenses) {
    const exp = expenses
      .filter((e) => e.budget === budgetName)
      .sort((a, b) => b.dateSort - a.dateSort);
    const cats = categories.filter((c) => c.budget === budgetName);
    const known = new Set(cats.map((c) => c.name));
    const rows = cats.map((c) => {
      const actual = round2(exp.filter((e) => e.category === c.name).reduce((s, e) => s + e.amount, 0));
      return { name: c.name, notes: c.notes, planned: c.planned, actual, remaining: round2(c.planned - actual) };
    });
    const other = round2(exp.filter((e) => !known.has(e.category)).reduce((s, e) => s + e.amount, 0));
    if (other) rows.push({ name: 'הוצאות בלי סעיף מתוכנן', notes: '', planned: 0, actual: other, remaining: -other });
    const spent = round2(exp.reduce((s, e) => s + e.amount, 0));
    const planned = round2(rows.reduce((s, r) => s + r.planned, 0));
    const pendingReimburse = round2(exp.filter((e) => e.paidBy && !e.reimbursed).reduce((s, e) => s + e.amount, 0));
    return {
      name: budgetName,
      collected: round2(collected),
      spent,
      balance: round2(collected - spent),
      planned,
      unplanned: round2(collected - planned),
      pendingReimburse,
      rows,
      expenses: exp,
    };
  }

  function compute(raw) {
    const settings = readSettings(raw.settings);
    const classes = readClasses(raw.classes, settings);
    const categories = readCategories(raw.categories);
    const expenses = readExpenses(raw.expenses);
    const totalIncome = round2(classes.reduce((s, c) => s + c.income, 0));
    const totalExpected = round2(classes.reduce((s, c) => s + c.expected, 0));
    const leadCollected = round2(classes.reduce((s, c) => s + c.leadShare, 0));
    const leadExpected = round2(classes.reduce((s, c) => s + c.expectedLeadShare, 0));

    const classViews = {};
    classes.forEach((c) => {
      const v = budgetView(c.name, c.classShare, categories, expenses);
      v.info = c;
      v.expectedCollected = c.expectedClassShare;
      classViews[c.name] = v;
    });
    const leadership = budgetView(LEAD, leadCollected, categories, expenses);
    leadership.expectedCollected = leadExpected;
    leadership.original = settings.leadOriginal;

    return { settings, classes, classViews, leadership, totalIncome, totalExpected };
  }

  const api = { compute, num, LEAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(this);
