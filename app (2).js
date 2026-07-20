(function(){
  "use strict";

  const CAT_META = {
    hillslope: {
      icon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 32 L14 12 L20 22 L26 8 L38 32 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 32 L14 22 L18 27" stroke="currentColor" stroke-width="1.4" opacity="0.5"/></svg>`,
      tagline: "Burned slopes above roads, homes, or reservoirs",
      meta: "10 site parameters"
    },
    surfdrain: {
      icon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 14 Q12 8 20 14 T36 14" stroke="currentColor" stroke-width="2"/><path d="M4 22 Q12 16 20 22 T36 22" stroke="currentColor" stroke-width="2" opacity="0.7"/><path d="M4 30 Q12 24 20 30 T36 30" stroke="currentColor" stroke-width="2" opacity="0.4"/></svg>`,
      tagline: "Ditches, swales, and constructed drainage ways",
      meta: "7 site parameters"
    },
    stream: {
      icon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 10 C 10 20, 14 4, 20 14 S 30 24, 37 12" stroke="currentColor" stroke-width="2"/><path d="M3 22 C 10 32, 14 16, 20 26 S 30 36, 37 24" stroke="currentColor" stroke-width="2" opacity="0.5"/></svg>`,
      tagline: "Perennial and ephemeral channels, banks, and corridors",
      meta: "7 site parameters"
    }
  };

  const state = {
    category: null,
    answers: {}   // paramName -> option string or null
  };

  const $ = (sel, root) => (root||document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root||document).querySelectorAll(sel));

  const screens = {
    picker: $('#screen-picker'),
    form: $('#screen-form'),
    results: $('#screen-results')
  };

  function showScreen(name){
    Object.entries(screens).forEach(([k, el]) => { el.hidden = (k !== name); });
    window.scrollTo({top:0, behavior:'instant' in window ? 'instant' : 'auto'});
  }

  /* ---------------- Screen 1: category picker ---------------- */
  function renderCategoryGrid(){
    const grid = $('#categoryGrid');
    grid.innerHTML = '';
    Object.entries(APP_DATA.categories).forEach(([key, cat]) => {
      const meta = CAT_META[key] || {};
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'category-card';
      card.innerHTML = `
        <div class="cat-icon">${meta.icon || ''}</div>
        <h3>${cat.label}</h3>
        <p>${meta.tagline || ''}</p>
        <div class="cat-meta">${Object.keys(cat.parameters).length} parameters &middot; ${cat.bmp_order.length} practices</div>
      `;
      card.addEventListener('click', () => selectCategory(key));
      grid.appendChild(card);
    });
  }

  function selectCategory(key){
    state.category = key;
    state.answers = {};
    Object.keys(APP_DATA.categories[key].parameters).forEach(p => state.answers[p] = null);
    renderForm();
    showScreen('form');
  }

  /* ---------------- Screen 2: assessment form ---------------- */
  function renderForm(){
    const cat = APP_DATA.categories[state.category];
    $('#formTitle').textContent = `Describe the ${cat.label.toLowerCase()} site`;
    const form = $('#paramForm');
    form.innerHTML = '';
    Object.entries(cat.parameters).forEach(([paramName, options]) => {
      const field = document.createElement('div');
      field.className = 'param-field';
      field.dataset.param = paramName;
      const selectId = 'p_' + paramName.replace(/\W+/g, '_');
      field.innerHTML = `
        <label for="${selectId}">${paramName}</label>
        <select id="${selectId}">
          <option value="">Not specified</option>
          ${options.map(o => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join('')}
        </select>
      `;
      const select = field.querySelector('select');
      select.value = state.answers[paramName] || '';
      select.addEventListener('change', () => {
        state.answers[paramName] = select.value || null;
        field.classList.toggle('is-set', !!select.value);
      });
      field.classList.toggle('is-set', !!select.value);
      form.appendChild(field);
    });
  }

  function resetForm(){
    Object.keys(state.answers).forEach(k => state.answers[k] = null);
    renderForm();
  }

  /* ---------------- Scoring ---------------- */
  function computeResults(){
    const cat = APP_DATA.categories[state.category];
    const specifiedParams = Object.entries(state.answers).filter(([,v]) => v);
    const results = [];

    cat.bmp_order.forEach(bmp => {
      const bmpScores = cat.scores[bmp] || {};
      const contributions = [];
      specifiedParams.forEach(([param, option]) => {
        const paramScores = bmpScores[param];
        if (paramScores && paramScores[option] !== undefined && paramScores[option] !== null){
          contributions.push({ param, option, value: paramScores[option] });
        }
      });
      if (contributions.length === 0) return;
      const avg = contributions.reduce((s,c)=>s+c.value,0) / contributions.length;
      results.push({ bmp, avg, contributions, details: cat.bmp_details[bmp] || {} });
    });

    results.sort((a,b) => b.avg - a.avg);
    return { results, specifiedCount: specifiedParams.length };
  }

  function tierFor(score){
    const tiers = APP_DATA.classification;
    for (const t of tiers){
      if (score >= t.min && score <= t.max) return t;
    }
    return tiers[tiers.length-1];
  }
  function tierClass(label){
    if (label === 'Very Good') return 'tier-good';
    if (label === 'Good') return 'tier-ok';
    return 'tier-bad';
  }

  /* ---------------- Screen 3: results ---------------- */
  function renderResults(){
    const cat = APP_DATA.categories[state.category];
    const { results, specifiedCount } = computeResults();
    $('#resultsTitle').textContent = `Recommended practices for this ${cat.label.toLowerCase()} site`;

    if (specifiedCount === 0){
      $('#resultsSummary').textContent = 'No site conditions were specified, so no practices could be scored.';
      $('#legend').innerHTML = '';
      $('#resultsList').innerHTML = `<div class="empty-state">Go back and set at least one site condition to see recommendations.</div>`;
      return;
    }

    $('#resultsSummary').textContent = `Ranked by suitability, based on ${specifiedCount} of ${Object.keys(cat.parameters).length} site condition${specifiedCount===1?'':'s'} you specified. Scores are on a 0\u201320 scale, averaged across only the conditions you set.`;

    $('#legend').innerHTML = APP_DATA.classification.map(t => `
      <span><i style="background:${t.color}"></i>${t.label} (${t.min}\u2013${Math.round(t.max)})</span>
    `).join('');

    const list = $('#resultsList');
    list.innerHTML = '';

    let lastTierLabel = null;
    results.forEach((r, i) => {
      const tier = tierFor(r.avg);
      if (tier.label !== lastTierLabel){
        const heading = document.createElement('div');
        heading.className = 'group-heading';
        heading.textContent = tier.label;
        list.appendChild(heading);
        lastTierLabel = tier.label;
      }
      list.appendChild(renderBmpCard(r, i, tier));
    });
  }

  function renderBmpCard(r, index, tier){
    const card = document.createElement('div');
    card.className = `bmp-card ${tierClass(tier.label)}`;
    const pct = Math.max(0, Math.min(100, (r.avg/20)*100));
    const d = r.details;

    const fieldsOrder = [
      ['timing', 'Timing'],
      ['skills', 'Required skills'],
      ['materials', 'Materials'],
      ['equipment', 'Equipment'],
      ['implementation', 'Implementation'],
      ['maintenance', 'Maintenance'],
      ['monitoring', 'Monitoring'],
      ['when_where', 'When / where to use']
    ];
    const detailFields = fieldsOrder
      .filter(([key]) => d[key])
      .map(([key,label]) => `<div class="detail-item"><h4>${label}</h4><p>${escapeHtml(d[key])}</p></div>`)
      .join('');

    const sources = (d.sources || []).filter(Boolean);
    const sourcesHtml = sources.length ? `
      <div class="detail-sources"><strong>Sources:</strong>
        ${sources.map(s => {
          if (typeof s === 'string') {
            return `<a href="${escapeAttr(s)}" target="_blank" rel="noopener">[${escapeHtml(s.replace(/^https?:\/\//,'').split('/')[0])}]</a>`;
          }
          const icon = s.type === 'pdf' ? '📄' : '🔗';
          return `<a href="${escapeAttr(s.value)}" target="_blank" rel="noopener" title="${escapeAttr(s.label)}">${icon} ${escapeHtml(s.label)}</a>`;
        }).join(' &nbsp; ')}
      </div>` : '';

    const breakdown = r.contributions.map(c =>
      `<span>${escapeHtml(c.param)}: <strong>${c.value.toFixed(1)}</strong></span>`
    ).join('');

    card.innerHTML = `
      <div class="bmp-summary">
        <span class="bmp-rank">${index+1}</span>
        <div class="bmp-name-block">
          <div class="bmp-name">${escapeHtml(r.bmp)}</div>
          <div class="bmp-sub">${escapeHtml(d.subcategory || '')}</div>
        </div>
        <div class="bmp-score-wrap">
          <div class="bmp-scorebar"><span style="width:${pct}%"></span></div>
          <div class="bmp-score-num">${r.avg.toFixed(1)}</div>
        </div>
        <svg class="bmp-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3 L11 8 L6 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="bmp-detail">
        <div class="detail-grid">${detailFields}</div>
        ${sourcesHtml}
        <div class="score-breakdown"><strong>Score based on:</strong><br>${breakdown}</div>
      </div>
    `;
    card.querySelector('.bmp-summary').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
    return card;
  }

  /* ---------------- Utils ---------------- */
  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function escapeAttr(str){ return escapeHtml(str); }

  /* ---------------- Wire up ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    renderCategoryGrid();

    $('#backToPicker').addEventListener('click', () => showScreen('picker'));
    $('#backToForm').addEventListener('click', () => showScreen('form'));
    $('#resetForm').addEventListener('click', resetForm);
    $('#seeResults').addEventListener('click', () => { renderResults(); showScreen('results'); });

    $('#aboutBtn').addEventListener('click', () => { $('#aboutOverlay').hidden = false; });
    $('#aboutClose').addEventListener('click', () => { $('#aboutOverlay').hidden = true; });
    $('#aboutOverlay').addEventListener('click', (e) => { if (e.target.id === 'aboutOverlay') $('#aboutOverlay').hidden = true; });
  });
})();
