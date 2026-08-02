/* ============================================
   Country configuration
   Drives currency, terminology, and defaults
   across every calculator on the site.
   ============================================ */
const COUNTRIES = {
  US: {
    label: "United States",
    currency: "$",
    currencyCode: "USD",
    locale: "en-US",
    loanTerm: "Loan Payment",
    loanTermShort: "payment",
    defaultAmount: 25000,
    defaultRate: 6.5,
    defaultYears: 5,
  },
  GB: {
    label: "United Kingdom",
    currency: "£",
    currencyCode: "GBP",
    locale: "en-GB",
    loanTerm: "Loan Repayment",
    loanTermShort: "repayment",
    defaultAmount: 20000,
    defaultRate: 6.9,
    defaultYears: 5,
  },
  IN: {
    label: "India",
    currency: "₹",
    currencyCode: "INR",
    locale: "en-IN",
    loanTerm: "EMI",
    loanTermShort: "EMI",
    defaultAmount: 1000000,
    defaultRate: 8.5,
    defaultYears: 15,
  },
};

const DEFAULT_COUNTRY = "US";
const STORAGE_KEY = "siteCountry";

function getSavedCountry() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_COUNTRY;
  } catch (e) {
    return DEFAULT_COUNTRY;
  }
}

function saveCountry(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch (e) {
    /* ignore */
  }
}

function formatMoney(amount, countryCode) {
  const c = COUNTRIES[countryCode];
  return c.currency + Math.round(amount).toLocaleString(c.locale);
}

/* ---------- Country selector wiring (shared across pages) ---------- */
function initCountrySelector(onChange) {
  const select = document.getElementById("country-select");
  if (!select) return;

  const saved = getSavedCountry();
  select.value = saved;

  select.addEventListener("change", () => {
    saveCountry(select.value);
    onChange(select.value);
  });

  onChange(saved);
}

/* ============================================
   EMI / Loan payment math
   ============================================ */
function calcLoanPayment(principal, annualRatePct, years) {
  const monthlyRate = annualRatePct / 100 / 12;
  const months = years * 12;

  if (monthlyRate === 0) {
    const payment = principal / months;
    return { payment, totalPayment: principal, totalInterest: 0 };
  }

  const factor = Math.pow(1 + monthlyRate, months);
  const payment = (principal * monthlyRate * factor) / (factor - 1);
  const totalPayment = payment * months;
  const totalInterest = totalPayment - principal;

  return { payment, totalPayment, totalInterest };
}

/* "What if" extra payment: months/interest saved by paying extra each month */
function calcExtraPaymentSavings(principal, annualRatePct, years, extraMonthly) {
  const monthlyRate = annualRatePct / 100 / 12;
  const originalMonths = years * 12;
  const { payment: basePayment, totalInterest: baseInterest } = calcLoanPayment(
    principal,
    annualRatePct,
    years
  );

  if (extraMonthly <= 0) {
    return { monthsSaved: 0, interestSaved: 0 };
  }

  const newPayment = basePayment + extraMonthly;
  let balance = principal;
  let months = 0;
  let interestPaid = 0;

  while (balance > 0 && months < originalMonths) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    let principalPaid = newPayment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    interestPaid += interest;
    months += 1;
    if (balance <= 0.01) break;
  }

  const monthsSaved = originalMonths - months;
  const interestSaved = baseInterest - interestPaid;

  return {
    monthsSaved: Math.max(0, monthsSaved),
    interestSaved: Math.max(0, interestSaved),
  };
}

/* ============================================
   Savings growth (compound interest with
   regular monthly contributions)
   ============================================ */
function calcSavingsGrowth(initial, monthlyContribution, annualRatePct, years) {
  const monthlyRate = annualRatePct / 100 / 12;
  const months = years * 12;

  let balance = initial;
  let totalContributed = initial;

  for (let m = 0; m < months; m++) {
    balance += monthlyContribution;
    totalContributed += monthlyContribution;
    balance *= 1 + monthlyRate;
  }

  const totalGrowth = balance - totalContributed;

  return { futureValue: balance, totalContributed, totalGrowth };
}

/* ============================================
   Take-home pay — simplified progressive
   tax bands per country. These are approximate
   estimates for illustration, not exact tax
   advice (state/local taxes, NI thresholds,
   cess, etc. vary and are not modeled).
   ============================================ */
const TAX_BANDS = {
  US: [
    { upTo: 11600, rate: 0.10 },
    { upTo: 47150, rate: 0.12 },
    { upTo: 100525, rate: 0.22 },
    { upTo: 191950, rate: 0.24 },
    { upTo: Infinity, rate: 0.32 },
  ],
  GB: [
    { upTo: 12570, rate: 0 },
    { upTo: 50270, rate: 0.20 },
    { upTo: 125140, rate: 0.40 },
    { upTo: Infinity, rate: 0.45 },
  ],
  IN: [
    { upTo: 300000, rate: 0 },
    { upTo: 600000, rate: 0.05 },
    { upTo: 900000, rate: 0.10 },
    { upTo: 1200000, rate: 0.15 },
    { upTo: 1500000, rate: 0.20 },
    { upTo: Infinity, rate: 0.30 },
  ],
};

function calcTax(grossAnnual, countryCode) {
  const bands = TAX_BANDS[countryCode];
  let tax = 0;
  let lower = 0;

  for (const band of bands) {
    if (grossAnnual > lower) {
      const taxableInBand = Math.min(grossAnnual, band.upTo) - lower;
      tax += taxableInBand * band.rate;
      lower = band.upTo;
    } else {
      break;
    }
  }

  const netAnnual = grossAnnual - tax;
  const effectiveRate = grossAnnual > 0 ? (tax / grossAnnual) * 100 : 0;

  return { tax, netAnnual, effectiveRate };
}

function calcTaxBracketBreakdown(grossAnnual, countryCode) {
  const bands = TAX_BANDS[countryCode];
  let lower = 0;
  const rows = [];

  for (const band of bands) {
    if (grossAnnual > lower) {
      const taxableInBand = Math.min(grossAnnual, band.upTo) - lower;
      const taxInBand = taxableInBand * band.rate;
      rows.push({
        rangeLow: lower,
        rangeHigh: band.upTo,
        rate: band.rate * 100,
        taxableInBand,
        taxInBand,
      });
      lower = band.upTo;
    } else {
      break;
    }
  }

  return rows;
}

/* ============================================
   Amortization schedule (yearly breakdown)
   ============================================ */
function generateAmortizationSchedule(principal, annualRatePct, years) {
  const monthlyRate = annualRatePct / 100 / 12;
  const months = years * 12;
  const { payment } = calcLoanPayment(principal, annualRatePct, years);

  let balance = principal;
  const yearlyRows = [];
  let yearPrincipal = 0;
  let yearInterest = 0;

  for (let m = 1; m <= months; m++) {
    const interest = monthlyRate === 0 ? 0 : balance * monthlyRate;
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    yearPrincipal += principalPaid;
    yearInterest += interest;

    if (m % 12 === 0 || m === months) {
      yearlyRows.push({
        year: Math.ceil(m / 12),
        principalPaid: yearPrincipal,
        interestPaid: yearInterest,
        balance: Math.max(0, balance),
      });
      yearPrincipal = 0;
      yearInterest = 0;
    }
  }

  return yearlyRows;
}

/* ============================================
   Shared page UI: reading progress + back-to-top
   ============================================ */
/* ============================================
   Sync a slider with a manual number input,
   in both directions. Typing a value outside
   the slider's current range extends the range
   to fit, so users aren't capped by the slider.
   ============================================ */
function bindManualInput(sliderEl, inputEl, onChange) {
  sliderEl.addEventListener("input", function () {
    inputEl.value = sliderEl.value;
  });

  function commit() {
    if (inputEl.value === "") return;
    const val = Number(inputEl.value);
    if (isNaN(val)) return;

    if (val > Number(sliderEl.max)) sliderEl.max = val;
    if (val < Number(sliderEl.min)) sliderEl.min = Math.max(0, val);

    sliderEl.value = val;
    onChange();
  }

  // Commit when the user finishes typing (leaves the field),
  // not on every keystroke — avoids the slider jumping around
  // mid-type while the number is still incomplete.
  inputEl.addEventListener("change", commit);

  // Let Enter / mobile keyboard "Done" commit immediately too.
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputEl.blur();
    }
  });
}

function initReadingProgress() {
  const bar = document.getElementById("reading-progress");
  if (!bar) return;
  window.addEventListener("scroll", function () {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = pct + "%";
  });
}

function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;
  window.addEventListener("scroll", function () {
    if (window.scrollY > 500) {
      btn.classList.add("visible");
    } else {
      btn.classList.remove("visible");
    }
  });
  btn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ============================================
   Savings growth — yearly breakdown
   ============================================ */
function generateSavingsSchedule(initial, monthlyContribution, annualRatePct, years) {
  const monthlyRate = annualRatePct / 100 / 12;
  let balance = initial;
  let totalContributed = initial;
  const rows = [];
  let yearContributed = 0;
  let yearStartBalance = initial;

  for (let m = 1; m <= years * 12; m++) {
    balance += monthlyContribution;
    totalContributed += monthlyContribution;
    yearContributed += monthlyContribution;
    balance *= 1 + monthlyRate;

    if (m % 12 === 0) {
      rows.push({
        year: m / 12,
        contributed: yearContributed,
        growth: balance - yearStartBalance - yearContributed,
        balance: balance,
      });
      yearContributed = 0;
      yearStartBalance = balance;
    }
  }

  return rows;
}
