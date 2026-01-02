// Created on 2026-01-02 by Ivan Bes
import {
  createApp,
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

const locale = 'es-ES';
const canonicalUrl = 'https://blwond.github.io/web-interest-compound/';
let chartInstance;

const currencyFormatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const defaultForm = () => ({
  initial: '',
  contribution: '',
  rate: '',
  years: '',
  frequency: 12,
  startMonth: getDefaultStartMonth(),
});

createApp({
  setup() {
    const translations = ref({});
    const form = ref(defaultForm());
    const chartEl = ref(null);
    const ready = ref(false);
    const errors = ref([]);

    const results = computed(() => projectGrowth(form.value));

    const tableRows = computed(() =>
      results.value.timeline.slice(1).map((entry) => ({
        ...entry,
        label: formatLabel(entry, translations.value),
      })),
    );

    const t = (key) => resolveKey(translations.value, key) || '';

    const formatCurrency = (value) => currencyFormatter.format(value || 0);

    const formatTerm = (years) => {
      const yearsNumber = Number(years);
      if (!Number.isFinite(yearsNumber)) return '';
      const singular = resolveKey(translations.value, 'common.year') || 'year';
      const plural = resolveKey(translations.value, 'common.years') || 'years';
      const label = yearsNumber === 1 ? singular : plural;
      return `${yearsNumber} ${label}`;
    };

    const validate = () => {
      const messages = [];
      const { initial, years, rate } = form.value;
      const initialValid = Number.isFinite(Number(initial)) && Number(initial) >= 0 && initial !== '';
      const yearsValid = Number.isFinite(Number(years)) && Number(years) > 0;
      const rateValid = Number.isFinite(Number(rate)) && Number(rate) > 0;

      if (!initialValid) messages.push(t('errors.initial'));
      if (!yearsValid) messages.push(t('errors.years'));
      if (!rateValid) messages.push(t('errors.rate'));
      return messages;
    };

    const handleCalculate = () => {
      errors.value = validate();
      if (errors.value.length) return;
      renderChart();
    };

    const resetForm = () => {
      form.value = defaultForm();
      errors.value = [];
      renderChart();
    };

    const scrollTo = (id) => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    const renderChart = () => {
      if (errors.value.length) return;
      const el = chartEl.value;
      if (!el) return;

      const timeline = results.value.timeline;
      const labels = timeline.map((item) => formatLabel(item, translations.value));

      const dataset = {
        labels,
        datasets: [
          {
            label: resolveKey(translations.value, 'chart.series.balance') || 'Balance',
            data: timeline.map((item) => item.balance),
            fill: true,
            borderColor: '#66e0d2',
            backgroundColor: 'rgba(102, 224, 210, 0.15)',
            tension: 0.25,
          },
          {
            label: resolveKey(translations.value, 'chart.series.contributions') || 'Contributions',
            data: timeline.map((item) => item.contributions),
            fill: false,
            borderColor: '#7da6ff',
            backgroundColor: '#7da6ff',
            tension: 0.25,
            borderDash: [6, 6],
          },
        ],
      };

      if (chartInstance) {
        chartInstance.data = dataset;
        chartInstance.update();
        return;
      }

      chartInstance = new Chart(el, {
        type: 'line',
        data: dataset,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#e8ecf8' },
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y;
                  return `${label}: ${formatCurrency(value)}`;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#a4acc7' },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
            y: {
              ticks: { color: '#a4acc7' },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
          },
        },
      });
    };

    watch(
      () => results.value,
      () => nextTick(renderChart),
      { deep: true },
    );

    onMounted(async () => {
      await loadTranslations(translations);
      ready.value = true;
      applyMetaTranslations(translations.value);
      renderChart();
    });

    return {
      form,
      t,
      results,
      tableRows,
      formatCurrency,
      formatTerm,
      handleCalculate,
      resetForm,
      scrollTo,
      chartEl,
      errors,
      ready,
    };
  },
}).mount('#app');

async function loadTranslations(targetRef) {
  try {
    const response = await fetch(`locales/${locale}.json`);
    targetRef.value = await response.json();
  } catch (error) {
    console.error('Unable to load translations', error);
  }
}

function applyMetaTranslations(translations) {
  const title = resolveKey(translations, 'seo.title') || resolveKey(translations, 'app.title') || document.title;
  const description = resolveKey(translations, 'seo.description') || '';
  const keywords = resolveKey(translations, 'seo.keywords') || '';

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'keywords', keywords);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonicalUrl);

  const structuredData = document.getElementById('structuredData');
  if (structuredData) {
    const payload = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: title,
      description,
      url: canonicalUrl,
      applicationCategory: 'FinanceApplication',
      inLanguage: locale,
      operatingSystem: 'Any',
    };
    structuredData.textContent = JSON.stringify(payload);
  }
}

function setMeta(attr, key, value) {
  if (!value) return;
  let meta = document.querySelector(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', value);
}

function resolveKey(tree, path) {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), tree);
}

function getDefaultStartMonth() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatLabel(entry, translations) {
  if (entry.calendarYear && entry.calendarMonth) {
    const monthLabel = resolveKey(translations, 'common.monthLabel') || 'Month';
    return `${monthLabel} ${entry.calendarMonth}/${entry.calendarYear}`;
  }
  const periodLabel = resolveKey(translations, 'common.periodLabel') || 'Period';
  return `${periodLabel} ${entry.label}`;
}

function projectGrowth({ initial, contribution, rate, years, frequency, startMonth }) {
  const safeInitial = coerceNumber(initial, 0);
  const safeContribution = coerceNumber(contribution, 0);
  const safeRate = coerceNumber(rate, 0);
  const safeYears = Math.max(0, coerceNumber(years, 0));
  const safeFrequency = Math.max(1, coerceNumber(frequency, 1));

  const periods = Math.max(0, Math.round(safeYears * safeFrequency));
  const periodRate = safeRate / 100 / safeFrequency;
  const monthsPerPeriod = 12 / safeFrequency;
  const perPeriodContribution = safeContribution * monthsPerPeriod;
  const startDate = startMonth ? new Date(`${startMonth}-01`) : null;
  const baseYear = Number.isFinite(startDate?.getFullYear()) ? startDate.getFullYear() : null;
  const baseMonth = Number.isFinite(startDate?.getMonth()) ? startDate.getMonth() + 1 : null;

  const timeline = [
    {
      label: 0,
      balance: safeInitial,
      contributions: safeInitial,
      interest: 0,
      calendarYear: baseYear,
      calendarMonth: baseMonth,
    },
  ];

  let balance = safeInitial;
  let contributions = safeInitial;

  for (let period = 1; period <= periods; period += 1) {
    balance += perPeriodContribution;
    contributions += perPeriodContribution;
    balance *= 1 + periodRate;

    const interest = Math.max(0, balance - contributions);
    const currentDate = startDate ? addMonthsDecimal(startDate, monthsPerPeriod * period) : null;
    timeline.push({
      label: period,
      balance,
      contributions,
      interest,
      calendarYear: currentDate?.getFullYear() ?? null,
      calendarMonth: currentDate ? currentDate.getMonth() + 1 : null,
    });
  }

  const finalBalance = balance;
  const totalContributions = contributions;
  const totalInterest = Math.max(0, finalBalance - totalContributions);

  return {
    finalBalance,
    totalContributions,
    totalInterest,
    timeline,
  };
}

function coerceNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function addMonthsDecimal(date, monthsDecimal) {
  const wholeMonths = Math.floor(monthsDecimal);
  const remainder = monthsDecimal - wholeMonths;
  const base = addMonths(date, wholeMonths);
  if (remainder === 0) return base;
  const extraDays = Math.round(remainder * 30);
  const copy = new Date(base);
  copy.setDate(copy.getDate() + extraDays);
  return copy;
}
