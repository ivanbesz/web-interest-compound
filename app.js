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
    const ready = ref(false);
    const errors = ref([]);
    const showAdvanced = ref(false);

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

    const scrollTo = (id) => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    const renderChart = () => {
      if (errors.value.length) return;
      const el = chartEl.value;
      if (!el) return;

      const timeline = displayTimeline.value;
      if (!timeline.length) {
        el.innerHTML = '';
        return;
      }

      const balances = timeline.map((item) => item.balance);
      const contributions = timeline.map((item) => item.contributions);
      const realMax = Math.max(...balances, ...contributions);
      const hasSeries = Number.isFinite(realMax) && realMax > 0 && timeline.length > 1;
      const safeContribution = coerceNumber(form.value.contribution, 0);
      const safeInitial = coerceNumber(form.value.initial, 0);
      const totalContributions = timeline[timeline.length - 1]?.contributions ?? 0;

      let baseMax;
      if (safeContribution > 0) {
        const candidate = Math.max(realMax, totalContributions);
        baseMax = Math.ceil(candidate / 1000) * 1000;
      } else {
        baseMax = Math.max(realMax, safeInitial * 10);
      }

      const maxValue = Math.max(Number.isFinite(baseMax) ? baseMax : 0, 1);

      const margin = { top: 8, right: 6, bottom: 24, left: 18 };
      const width = 120;
      const height = 80;
      const axisBottom = height - margin.bottom;
      const axisLabelY = axisBottom + 8;
      const legendY = axisLabelY + 10;
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = axisBottom - margin.top;

      const scaleX = (idx) =>
        margin.left + (idx / Math.max(timeline.length - 1, 1)) * innerWidth;
      const scaleY = (value) => margin.top + innerHeight - (value / maxValue) * innerHeight;

      const points = timeline.map((item, idx) => {
        const x = scaleX(idx);
        return {
          x,
          yBalance: scaleY(item.balance),
          yContrib: scaleY(item.contributions),
          label: formatLabel(item, translations.value),
          balance: item.balance,
          contributions: item.contributions,
        };
      });

      const balancePolyline = points.map((p) => `${p.x},${p.yBalance}`).join(' ');
      const contribPolyline = points.map((p) => `${p.x},${p.yContrib}`).join(' ');

      const gridY = Array.from({ length: 5 })
        .map((_, i) => {
          const yVal = (i / 4) * maxValue;
          const y = scaleY(yVal);
          const label = formatCurrency(yVal);
          return `<g class="grid">
            <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" />
            <text class="axis-text" x="4" y="${y + 3}">${label}</text>
          </g>`;
        })
        .join('');

      const xTicks = Math.min(6, timeline.length);
      const step = Math.max(1, Math.floor(timeline.length / xTicks));
      const gridX = timeline
        .map((item, idx) => ({ item, idx }))
        .filter(({ idx }) => idx % step === 0 || idx === timeline.length - 1)
        .map(({ item, idx }) => {
          const x = scaleX(idx);
          const label = formatLabel(item, translations.value);
          return `<g class="grid">
            <line x1="${x}" y1="${margin.top}" x2="${x}" y2="${axisBottom}" />
            <text class="axis-text" x="${x}" y="${axisLabelY}" text-anchor="middle">${label}</text>
          </g>`;
        })
        .join('');

      const legendBalanceBase =
        resolveKey(translations.value, 'chart.series.balance') || 'Balance futuro';
      const rateValue = coerceNumber(form.value.rate, 0);
      const legendBalance = `${legendBalanceBase} (${rateValue.toFixed(2)}%)`;
      const legendContrib =
        resolveKey(translations.value, 'chart.series.contributions') || 'Aportaciones totales';
      const estimateTextWidth = (text) => text.length * 2.6;
      const legendCircleDiameter = 4;
      const legendGap = 3;
      const legendItemSpacing = 8;
      const legendItems = [
        { label: legendBalance, className: 'legend-balance' },
        { label: legendContrib, className: 'legend-contrib' },
      ];

      el.innerHTML = `
        <g>${gridY}</g>
        <g>${gridX}</g>
        <polyline class="line-balance" points="${balancePolyline}" />
        <polyline class="line-contrib" points="${contribPolyline}" />
        <g class="legend" transform="translate(0, ${legendY})">
          ${(() => {
            let currentX = 0;
            return legendItems
              .map((item) => {
                const textWidth = estimateTextWidth(item.label);
                const itemWidth = legendCircleDiameter + legendGap + textWidth;
                const markup = `<g transform="translate(${currentX},0)">
                  <circle cx="${legendCircleDiameter / 2}" cy="0" r="2" class="legend-dot ${item.className}"></circle>
                  <text x="${legendCircleDiameter + legendGap}" y="1" class="legend-text">${item.label}</text>
                </g>`;
                currentX += itemWidth + legendItemSpacing;
                return markup;
              })
              .join('');
          })()}
        </g>
        <g id="tooltip" style="display:none">
          <line class="tooltip-line" x1="0" y1="${margin.top}" x2="0" y2="${axisBottom}" />
          <circle class="tooltip-dot" r="1.4" cx="0" cy="0" />
          <rect class="tooltip-box" x="0" y="0" width="68" height="18"></rect>
          <circle class="tooltip-dot-balance" r="1" cx="0" cy="0"></circle>
          <circle class="tooltip-dot-contrib" r="1" cx="0" cy="0"></circle>
          <text class="tooltip-text" x="0" y="0">
            <tspan id="tooltip-label" x="0" dy="4"></tspan>
            <tspan id="tooltip-balance" x="0" dy="6"></tspan>
            <tspan id="tooltip-contrib" x="0" dy="6"></tspan>
          </text>
        </g>
      `;

      const legendGroup = el.querySelector('.legend');
      const legendBox = legendGroup?.getBBox();
      if (legendGroup && legendBox) {
        const legendOffsetX = (width - legendBox.width) / 2 - legendBox.x;
        legendGroup.setAttribute('transform', `translate(${legendOffsetX}, ${legendY})`);
      }

      const tooltip = el.querySelector('#tooltip');
      const line = tooltip.querySelector('.tooltip-line');
      const dot = tooltip.querySelector('.tooltip-dot');
      const box = tooltip.querySelector('.tooltip-box');
      const labelEl = tooltip.querySelector('#tooltip-label');
      const balEl = tooltip.querySelector('#tooltip-balance');
      const contribEl = tooltip.querySelector('#tooltip-contrib');
      const dotBal = tooltip.querySelector('.tooltip-dot-balance');
      const dotContrib = tooltip.querySelector('.tooltip-dot-contrib');

      const updateTooltip = (clientX) => {
        const rect = el.getBoundingClientRect();
        const relX = ((clientX - rect.left) / rect.width) * width;
        let nearest = points[0];
        let minDist = Infinity;
        points.forEach((p) => {
          const dist = Math.abs(p.x - relX);
          if (dist < minDist) {
            minDist = dist;
            nearest = p;
          }
        });

        const x = nearest.x;
        const y = nearest.yBalance;
        line.setAttribute('x1', x);
        line.setAttribute('x2', x);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);

        labelEl.textContent = nearest.label;
        balEl.textContent = `${legendBalance}: ${formatCurrency(nearest.balance)}`;
        contribEl.textContent = `${legendContrib}: ${formatCurrency(nearest.contributions)}`;

        const boxWidth = 68;
        const boxHeight = 18;
        const boxX = Math.min(Math.max(x + 1, margin.left), width - margin.right - boxWidth);
        const boxY = Math.max(y - boxHeight, margin.top);
        box.setAttribute('x', boxX);
        box.setAttribute('y', boxY);
        box.setAttribute('width', boxWidth);
        box.setAttribute('height', boxHeight);
        labelEl.setAttribute('x', boxX + 2);
        labelEl.setAttribute('y', boxY + 4);
        balEl.setAttribute('x', boxX + 6);
        balEl.setAttribute('y', boxY + 9);
        contribEl.setAttribute('x', boxX + 6);
        contribEl.setAttribute('y', boxY + 14);

        dotBal.setAttribute('cx', boxX + 2.5);
        dotBal.setAttribute('cy', boxY + 8.5);
        dotContrib.setAttribute('cx', boxX + 2.5);
        dotContrib.setAttribute('cy', boxY + 13.5);

        tooltip.style.display = 'block';
      };

      if (hasSeries) {
        el.onmousemove = (e) => updateTooltip(e.clientX);
        el.onmouseleave = () => {
          tooltip.style.display = 'none';
        };
        updateTooltip(el.getBoundingClientRect().left);
      } else {
        tooltip.style.display = 'none';
        el.onmousemove = null;
        el.onmouseleave = null;
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
      scrollTo,
      chartEl,
      errors,
      ready,
      showAdvanced,
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
