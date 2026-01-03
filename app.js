// Created on 2026-01-02 by Ivan Bes
import {
  createApp,
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

const locale = 'es-ES';
const canonicalUrl = 'https://blwond.github.io/web-interest-compound/';
let chartInstance = null;

const currencyFormatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const defaultForm = () => ({
  initial: '',
  contribution: '',
  contributionFrequency: 12,
  contributionGrowth: 0,
  contributeAtStart: true,
  rate: '',
  years: '',
  frequency: 1,
  viewFrequency: 1,
});

  createApp({
    setup() {
      const translations = ref({});
      const form = ref(defaultForm());
      const chartEl = ref(null);
      let resizeObserver = null;
      const ready = ref(false);
      const errors = ref([]);
      const showAdvanced = ref(false);
      const showConsent = ref(false);

    const results = computed(() => projectGrowth(form.value));

    const displayTimeline = computed(() => {
      const base = results.value.timeline || [];
      const stepPerYear = results.value.stepPerYear || 1;
      const viewFreq = Math.max(1, coerceNumber(form.value.viewFrequency, 1));
      const interval = Math.max(1, Math.round(stepPerYear / viewFreq));

      return base
        .filter((_, idx) => idx % interval === 0 || idx === base.length - 1)
        .map((entry, idx) => ({
          ...entry,
          label: idx,
          frequency: viewFreq,
        }));
    });

    const tableRows = computed(() =>
      displayTimeline.value.slice(1).map((entry) => ({
        ...entry,
        label: formatLabel(entry, translations.value),
      })),
    );

    const t = (key) => resolveKey(translations.value, key) || '';

    const contributionPeriod = computed(() => {
      const freq = Number(form.value.contributionFrequency);
      const periodNames = resolveKey(translations.value, 'common.periodNames') || {};
      if (freq === 1) return periodNames.yearly || 'anual';
      if (freq === 2) return periodNames.semiannually || 'semestral';
      if (freq === 4) return periodNames.quarterly || 'trimestral';
      if (freq === 12) return periodNames.monthly || 'mensual';
      if (freq === 52) return periodNames.weekly || 'semanal';
      if (freq === 365) return periodNames.daily || 'diario';
      return resolveKey(translations.value, 'common.periodLabel') || 'periodo';
    });

    const contributionLabel = computed(() => {
      const base = resolveKey(translations.value, 'form.contributionBase') || 'Aporte';
      const period = contributionPeriod.value;
      return `${base} ${String(period).toLowerCase()}`;
    });

    const contributionPlaceholder = computed(() => {
      const base =
        resolveKey(translations.value, 'placeholders.contributionBase') ||
        resolveKey(translations.value, 'placeholders.contribution') ||
        'Introduce tu aporte';
      const period = contributionPeriod.value;
      return `${base} ${String(period).toLowerCase()}`;
    });

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

    const toggleAdvanced = () => {
      showAdvanced.value = !showAdvanced.value;
    };

    const setConsent = (value) => {
      try {
        localStorage.setItem('cookieConsent', value);
      } catch (err) {
        console.warn('Unable to persist cookie consent', err);
      }
      showConsent.value = false;
    };

    const acceptAllCookies = () => setConsent('all');
    const acceptEssential = () => setConsent('essential');

    const scrollTo = (id) => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

      const renderChart = () => {
        if (errors.value.length) return;
        const canvas = chartEl.value;
        if (!canvas) return;

        const timeline = displayTimeline.value;
        if (!timeline.length) {
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          return;
        }

        const labels = timeline.map((entry) => formatLabel(entry, translations.value));
        const balances = timeline.map((item) => item.balance);
        const contributions = timeline.map((item) => item.contributions);

        const legendBalanceBase =
          resolveKey(translations.value, 'chart.series.balance') || 'Balance futuro';
        const rateValue = coerceNumber(form.value.rate, 0);
        const legendBalance = `${legendBalanceBase} (${rateValue.toFixed(2)}%)`;
        const legendContrib =
          resolveKey(translations.value, 'chart.series.contributions') || 'Aportaciones totales';

        // Check context
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (typeof Chart === 'undefined') {
          console.warn('Chart.js not loaded');
          return;
        }

        const parentWidth = canvas.parentElement?.clientWidth || canvas.clientWidth || 800;
        const isNarrow = parentWidth < 640;

        // Common options generator based on current width
        const getOptions = () => ({
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: {
            padding: {
              top: isNarrow ? 12 : 20,
              right: isNarrow ? 10 : 20,
              bottom: isNarrow ? 12 : 12,
              left: isNarrow ? 0 : 0,
            },
          },
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              padding: isNarrow ? 14 : 30,
              labels: {
                usePointStyle: true,
                boxWidth: isNarrow ? 10 : 12,
                boxHeight: isNarrow ? 10 : 12,
                padding: isNarrow ? 10 : 20,
                font: { size: isNarrow ? 11 : 12 },
              },
            },
            tooltip: {
              callbacks: {
                title(context) {
                  return context[0]?.label || '';
                },
                label(context) {
                  const value = context.parsed.y ?? 0;
                  return `${context.dataset.label}: ${formatCurrency(value)}`;
                },
              },
            },
          },
          scales: {
            x: {
              offset: true,
              grid: { color: 'rgba(0, 0, 0, 0.04)' },
              ticks: {
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: isNarrow ? 4 : 8,
                color: '#4b5563',
                font: { size: 11 },
              },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0, 0, 0, 0.04)' },
              ticks: {
                color: '#4b5563',
                font: { size: 11 },
                maxTicksLimit: 6,
                callback: (value) => currencyFormatter.format(value),
              },
            },
          },
        });

        if (chartInstance) {
          chartInstance.data.labels = labels;
          chartInstance.data.datasets[0].data = balances;
          chartInstance.data.datasets[0].label = legendBalance;
          chartInstance.data.datasets[1].data = contributions;
          chartInstance.data.datasets[1].label = legendContrib;
          chartInstance.options = getOptions();
          chartInstance.update('none'); // Update without animation
        } else {
          chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: legendBalance,
                  data: balances,
                  borderColor: '#2563eb',
                  backgroundColor: 'rgba(37, 99, 235, 0.12)',
                  tension: 0.15,
                  pointRadius: 3,
                  pointHoverRadius: 5,
                  fill: false,
                },
                {
                  label: legendContrib,
                  data: contributions,
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  borderDash: [6, 4],
                  tension: 0.15,
                  pointRadius: 3,
                  pointHoverRadius: 5,
                  fill: false,
                },
              ],
            },
            options: getOptions(),
          });
        }
      };

    watch(
      () => [results.value, form.value.viewFrequency],
      () => nextTick(renderChart),
      { deep: true },
    );

      onMounted(async () => {
        await loadTranslations(translations);
        ready.value = true;
        applyMetaTranslations(translations.value);
        renderChart();
        const container = chartEl.value?.parentElement;
        if (container && typeof ResizeObserver !== 'undefined') {
          let resizeTimer;
          resizeObserver = new ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              requestAnimationFrame(renderChart);
            }, 100);
          });
          resizeObserver.observe(container);
        }
        try {
          const stored = localStorage.getItem('cookieConsent');
          showConsent.value = stored !== 'all' && stored !== 'essential';
        } catch (err) {
          console.warn('Unable to read cookie consent', err);
          showConsent.value = true;
        }
      });

      onBeforeUnmount(() => {
        if (resizeObserver) {
          resizeObserver.disconnect();
          resizeObserver = null;
        }
        if (chartInstance) {
          chartInstance.destroy();
          chartInstance = null;
        }
      });

      return {
        form,
        t,
        results,
        tableRows,
      formatCurrency,
      formatTerm,
      contributionLabel,
      contributionPlaceholder,
      handleCalculate,
      resetForm,
      toggleAdvanced,
      acceptAllCookies,
      acceptEssential,
      scrollTo,
      chartEl,
      errors,
      ready,
      showAdvanced,
      showConsent,
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
  return '';
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatLabel(entry, translations) {
  const freq = Number(entry.frequency || 0);
  const periods = resolveKey(translations, 'common.periods') || {};
  if (freq === 1) {
    const yearLabel = resolveKey(translations, 'table.year') || 'Año';
    return `${yearLabel} ${entry.label}`;
  }
  if (freq === 2) return `${periods.semester || 'Semestre'} ${entry.label}`;
  if (freq === 4) return `${periods.quarter || 'Trimestre'} ${entry.label}`;
  if (freq === 12) return `${periods.month || 'Mes'} ${entry.label}`;
  if (freq === 52) return `${periods.week || 'Semana'} ${entry.label}`;
  if (freq === 365) return `${periods.day || 'Día'} ${entry.label}`;
  const periodLabel = resolveKey(translations, 'common.periodLabel') || 'Periodo';
  return `${periodLabel} ${entry.label}`;
}

function projectGrowth({
  initial,
  contribution,
  contributionFrequency,
  contributionGrowth,
  contributeAtStart,
  rate,
  years,
  frequency,
}) {
  const safeInitial = coerceNumber(initial, 0);
  const safeContribution = coerceNumber(contribution, 0);
  const safeRate = coerceNumber(rate, 0);
  const safeYears = Math.max(0, coerceNumber(years, 0));
  const safeFrequency = Math.max(1, coerceNumber(frequency, 1));
  const safeContributionFrequency = Math.max(1, coerceNumber(contributionFrequency, 12));
  const safeContributionGrowth = Math.max(0, coerceNumber(contributionGrowth, 0)) / 100;
  const safeContributeAtStart = Boolean(contributeAtStart);

  const stepPerYear = lcm(safeFrequency, safeContributionFrequency);
  const periods = Math.max(0, Math.round(safeYears * stepPerYear));
  const interestInterval = Math.max(1, stepPerYear / safeFrequency);
  const contributionInterval = Math.max(1, stepPerYear / safeContributionFrequency);
  const perEventContribution = safeContribution;
  const periodRate = safeRate / 100 / safeFrequency;

  const timeline = [
    {
      label: 0,
      step: 0,
      balance: safeInitial,
      contributions: safeInitial,
      interest: 0,
      calendarYear: null,
      calendarMonth: null,
      frequency: safeFrequency,
      stepPerYear,
    },
  ];

  let balance = safeInitial;
  let contributions = safeInitial;
  let currentYear = 0;
  let contributionPerEvent = perEventContribution;

  for (let period = 1; period <= periods; period += 1) {
    const periodYear = Math.floor((period - 1) / stepPerYear);
    if (periodYear > currentYear) {
      currentYear = periodYear;
      contributionPerEvent *= 1 + safeContributionGrowth;
    }

    const isContributionPeriod = (period - 1) % contributionInterval === 0 && safeContribution > 0;
    const contributionThisStep = isContributionPeriod ? contributionPerEvent : 0;

    if (isContributionPeriod && safeContributeAtStart) {
      balance += contributionThisStep;
      contributions += contributionThisStep;
    }

    if (period % interestInterval === 0) {
      balance *= 1 + periodRate;
    }

    if (isContributionPeriod && !safeContributeAtStart) {
      balance += contributionThisStep;
      contributions += contributionThisStep;
    }

    const interest = Math.max(0, balance - contributions);
    timeline.push({
      label: period,
      step: period,
      balance,
      contributions,
      interest,
      calendarYear: null,
      calendarMonth: null,
      frequency: safeFrequency,
      stepPerYear,
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
    stepPerYear,
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

function lcm(a, b) {
  const safeA = Math.max(1, Math.abs(Math.round(a)));
  const safeB = Math.max(1, Math.abs(Math.round(b)));
  return (safeA * safeB) / gcd(safeA, safeB);
}

function gcd(a, b) {
  let x = a;
  let y = b;
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x;
}
