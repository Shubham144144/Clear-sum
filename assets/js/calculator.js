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
