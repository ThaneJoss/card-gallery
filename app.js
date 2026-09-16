(() => {
  'use strict';

  const cards = [
    { id:'boc-mountain', name:'长城环球通白金卡', bank:'中国银行', type:'credit', networks:['visa','unionpay'], keywords:'雪山 月夜 山峰 蓝色 长城 环球通 bank of china boc', art:[70,252,438,194] },
    { id:'icbc-spring', name:'工银香格里拉联名卡', bank:'中国工商银行', type:'credit', networks:['mastercard','unionpay'], keywords:'樱花 春日 古塔 粉色 工行 icbc', art:[551,252,435,194] },
    { id:'abc-valley', name:'农行悠然白金卡', bank:'中国农业银行', type:'credit', networks:['unionpay'], keywords:'山谷 田园 绿色 河流 农行 abc', art:[1029,252,440,194] },
    { id:'ccb-city', name:'龙卡全球支付信用卡', bank:'中国建设银行', type:'credit', networks:['visa','mastercard'], keywords:'城市 天际线 广州 广州塔 日落 建行 ccb', art:[70,506,438,188] },
    { id:'cmb-coast', name:'经典白金卡', bank:'招商银行', type:'credit', networks:['visa','amex'], keywords:'灯塔 海岸 日落 夕阳 经典白 招行 cmb', art:[551,506,435,188] },
    { id:'bocom-wall', name:'太平洋标准信用卡', bank:'交通银行', type:'credit', networks:['mastercard','jcb','unionpay'], keywords:'长城 山脉 中国 蓝色 交行 bocom', art:[1029,506,440,188] },
    { id:'cib-ink', name:'兴业悠系列信用卡', bank:'兴业银行', type:'credit', networks:['unionpay'], keywords:'水墨 江南 小舟 湖泊 黑白 冬日 cib', art:[70,756,438,188] },
    { id:'citic-autumn', name:'颜卡·秋日限定', bank:'中信银行', type:'credit', networks:['unionpay'], keywords:'秋天 枫叶 古塔 红色 橙色 citic', art:[551,756,435,188] },
    { id:'spdb-ocean', name:'浦发梦卡', bank:'浦发银行', type:'debit', networks:['unionpay'], keywords:'鲸鱼 蓝鲸 海洋 大海 蓝色 浦发 spdb', art:[1029,756,440,188] }
  ];
  const state = { type:'all', bank:'all', network:'all', query:'' };
  let visibleCards = [...cards];
  let lastFocusedCard = null;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const gallery = $('#gallery');
  const dialog = $('#card-dialog');
  const search = $('#search-input');
  let activePicker = null;
  const cardRatio = 85.6 / 53.98;

  const escapeHTML = (text) => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sprite = (rect, className, alt = '') => {
    const [x,y,w,h] = rect;
    return `<span class="sprite ${className}" style="--x:${x};--y:${y};--w:${w};--h:${h}"><img src="./assets/collection.webp" alt="${escapeHTML(alt)}" draggable="false" decoding="async"></span>`;
  };

  const bankLogos = {
    '中国银行':'boc', '中国工商银行':'icbc', '中国农业银行':'abc',
    '中国建设银行':'ccb', '招商银行':'cmb', '交通银行':'bocom',
    '兴业银行':'cib', '中信银行':'citic', '浦发银行':'spdb'
  };
  const genericIcons = {
    bank:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-6 9 6H3ZM4 21h16M6 11v7M10 11v7M14 11v7M18 11v7"/></svg>',
    network:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h3"/></svg>'
  };
  const bankLogo = (bank) => `<img class="bank-logo" src="./assets/logos/banks/${bankLogos[bank]}.svg" alt="${escapeHTML(bank)}" title="${escapeHTML(bank)}" draggable="false">`;
  const pickerOptions = {
    bank:[{value:'all',label:'全部银行'}, ...Object.keys(bankLogos).map(bank => ({value:bank,label:bank,logo:`./assets/logos/banks/${bankLogos[bank]}.svg`}))],
    network:[
      {value:'all',label:'全部卡组织'},
      {value:'visa',label:'Visa'}, {value:'mastercard',label:'Mastercard'},
      {value:'unionpay',label:'银联 UnionPay'}, {value:'amex',label:'American Express'},
      {value:'jcb',label:'JCB'}, {value:'discover',label:'Discover'}
    ].map(item => item.value === 'all' ? item : {...item,logo:`./assets/logos/networks/${item.value}.svg`})
  };
  const optionIcon = (kind, option) => option.logo ? `<img src="${option.logo}" alt="" draggable="false">` : genericIcons[kind];

  function syncPickers() {
    for (const kind of ['bank','network']) {
      const selected = pickerOptions[kind].find(option => option.value === state[kind]);
      $(`#${kind}-picker-label`).textContent = selected.label;
      $(`#${kind}-picker-icon`).innerHTML = optionIcon(kind, selected);
      const trigger = $(`#${kind}-trigger`);
      trigger.title = selected.label;
      trigger.setAttribute('aria-label', `按${kind === 'bank' ? '银行' : '卡组织'}筛选：${selected.label}`);
      $(`#${kind}-options`).querySelectorAll('[role="option"]').forEach(option => {
        option.setAttribute('aria-selected', String(option.dataset.value === state[kind]));
      });
    }
  }

  function closePicker(restoreFocus = false) {
    if (!activePicker) return;
    const kind = activePicker;
    const menu = $(`#${kind}-options`);
    if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) menu.hidePopover();
    menu.hidden = true;
    $(`#${kind}-trigger`).setAttribute('aria-expanded','false');
    activePicker = null;
    if (restoreFocus) $(`#${kind}-trigger`).focus({preventScroll:true});
  }

  function openPicker(kind, last = false) {
    closePicker();
    activePicker = kind;
    const trigger = $(`#${kind}-trigger`);
    const menu = $(`#${kind}-options`);
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(kind === 'bank' ? 264 : 255, viewportWidth - 24);
    const below = viewportHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const placeBelow = below >= Math.min(360, above);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(440, placeBelow ? below : above))}px`;
    menu.style.left = `${Math.max(12,Math.min(rect.left,viewportWidth-width-12))}px`;
    menu.hidden = false;
    if (typeof menu.showPopover === 'function') menu.showPopover();
    menu.style.top = `${placeBelow ? rect.bottom + 8 : Math.max(12,rect.top-menu.offsetHeight-8)}px`;
    trigger.setAttribute('aria-expanded','true');
    const options = [...menu.querySelectorAll('[role="option"]')];
    const selected = options.find(option => option.dataset.value === state[kind]);
    const target = last ? options.at(-1) : selected || options[0];
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'nearest'});
  }

  for (const kind of ['bank','network']) {
    const menu = $(`#${kind}-options`);
    const trigger = $(`#${kind}-trigger`);
    menu.innerHTML = pickerOptions[kind].map((option,index) => `<button class="picker-option" type="button" role="option" id="${kind}-option-${index}" data-value="${escapeHTML(option.value)}" aria-selected="false" tabindex="-1"><span class="option-icon" aria-hidden="true">${optionIcon(kind,option)}</span><span class="option-label">${escapeHTML(option.label)}</span><svg class="option-check" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg></button>`).join('');
    trigger.addEventListener('click', () => activePicker === kind ? closePicker(true) : openPicker(kind));
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openPicker(kind,event.key === 'ArrowUp');
      }
    });
    menu.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      state[kind] = option.dataset.value;
      render();
      closePicker(true);
    });
    menu.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('[role="option"]')];
      const index = options.indexOf(document.activeElement);
      let next = null;
      if (event.key === 'ArrowDown') next = options[(index+1)%options.length];
      if (event.key === 'ArrowUp') next = options[(index-1+options.length)%options.length];
      if (event.key === 'Home') next = options[0];
      if (event.key === 'End') next = options.at(-1);
      if (next) { event.preventDefault(); next.focus({preventScroll:true}); next.scrollIntoView({block:'nearest'}); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(true); }
      if (event.key === 'Tab') closePicker(true);
    });
  }
  document.addEventListener('pointerdown', event => {
    if (activePicker && !$(`#${activePicker}-options`).contains(event.target) && !$(`#${activePicker}-trigger`).contains(event.target)) closePicker();
  });
  function updateToolbarHint() {
    const rail = $('.filter-rail');
    const remaining = rail.scrollWidth-rail.clientWidth-rail.scrollLeft;
    $('.filters').classList.toggle('has-overflow',rail.scrollWidth>rail.clientWidth+1);
    $('.filters').classList.toggle('at-end',remaining<=1);
  }
  $('.filter-rail').addEventListener('scroll', () => { closePicker(); updateToolbarHint(); }, {passive:true});
  requestAnimationFrame(updateToolbarHint);

  $('#count-all').textContent = cards.length;
  $('#count-debit').textContent = cards.filter(card => card.type === 'debit').length;
  $('#count-credit').textContent = cards.filter(card => card.type === 'credit').length;

  function matches(card, filters = state) {
    const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const haystack = [card.name, card.bank, card.keywords, ...card.networks].join(' ').toLocaleLowerCase();
    return (filters.type === 'all' || card.type === filters.type)
      && (filters.bank === 'all' || card.bank === filters.bank)
      && (filters.network === 'all' || card.networks.includes(filters.network))
      && words.every(word => haystack.includes(word));
  }

  function render() {
    visibleCards = cards.filter(card => matches(card));
    $$('.type-button').forEach(button => {
      const active = button.dataset.type === state.type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $$('.network-button').forEach(button => {
      const active = button.dataset.network === state.network;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    syncPickers();
    $('#clear-search').hidden = search.value.length === 0;
    gallery.innerHTML = visibleCards.map((card, index) => `<article class="gallery-card" style="--index:${Math.min(index, 5)}"><button class="card-button" type="button" data-card="${card.id}" aria-label="查看${escapeHTML(card.bank)}${escapeHTML(card.name)}卡面">${sprite(card.art, 'card-art', `${card.bank} ${card.name}`)}<span class="card-caption"><span class="card-name">${escapeHTML(card.name)}</span><span class="card-bank">${bankLogo(card.bank)}</span></span></button></article>`).join('');
    const filtered = state.type !== 'all' || state.bank !== 'all' || state.network !== 'all' || state.query.trim() !== '';
    $('#results-note').hidden = !filtered;
    $('#results-text').textContent = `找到 ${visibleCards.length} 张卡片${state.query.trim() ? ` · “${state.query.trim()}”` : ''}`;
    $('#empty-state').hidden = visibleCards.length !== 0;
    gallery.hidden = visibleCards.length === 0;
    $('#live-status').textContent = `当前显示 ${visibleCards.length} 张卡片，共收藏 ${cards.length} 张。`;
  }

  function resetFilters() {
    closePicker();
    Object.assign(state, {type:'all', bank:'all', network:'all', query:''});
    search.value = '';
    render();
  }

  function showCard(id) {
    const card = cards.find(item => item.id === id);
    if (!card) return;
    $('#detail-art').innerHTML = sprite(card.art, 'card-art', `${card.bank} ${card.name}卡面`);
    $('#detail-title').textContent = card.name;
    $('#detail-bank').innerHTML = bankLogo(card.bank);
    $('#detail-type').textContent = card.type === 'debit' ? '储蓄卡' : '信用卡';
    if (!dialog.open) {
      closePicker();
      lastFocusedCard = document.activeElement;
      dialog.showModal();
      fitDialog();
      $('#close-dialog').focus({preventScroll:true});
    }
  }

  function fitDialog() {
    if (!dialog.open) return;
    const viewport = window.visualViewport;
    const availableWidth = (viewport?.width || window.innerWidth) - 32;
    const availableHeight = (viewport?.height || window.innerHeight) - 32;
    const style = getComputedStyle(dialog);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    let artWidth = Math.max(1,Math.min(788,availableWidth-horizontalPadding));
    for (let pass = 0; pass < 5; pass++) {
      dialog.style.width = `${artWidth + horizontalPadding}px`;
      const information = $('.detail-information');
      const infoStyle = getComputedStyle(information);
      const captionHeight = information.getBoundingClientRect().height + parseFloat(infoStyle.marginTop) + parseFloat(infoStyle.marginBottom);
      const heightLimit = Math.max(1,availableHeight-verticalPadding-captionHeight-1);
      const nextWidth = Math.min(artWidth, heightLimit*cardRatio);
      if (Math.abs(nextWidth-artWidth) < 0.1) break;
      artWidth = nextWidth;
    }
    dialog.style.width = `${artWidth + horizontalPadding}px`;
    dialog.scrollTop = 0;
  }
  function handleViewportChange() {
    closePicker();
    updateToolbarHint();
    if (dialog.open) fitDialog();
  }
  window.addEventListener('resize',handleViewportChange,{passive:true});
  window.addEventListener('scroll',() => closePicker(),{passive:true});
  window.visualViewport?.addEventListener('resize',handleViewportChange,{passive:true});

  $('.type-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-type]');
    if (button) { state.type = button.dataset.type; render(); }
  });
  $('.network-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-network]');
    if (button) { state.network = button.dataset.network; render(); }
  });
  search.addEventListener('input', () => { state.query = search.value; render(); });
  $('#search-form').addEventListener('submit', event => { event.preventDefault(); search.blur(); });
  $('#clear-search').addEventListener('click', () => { search.value = ''; state.query = ''; render(); search.focus(); });
  $('#reset-filters').addEventListener('click', () => { resetFilters(); $('.type-button').focus(); });
  $('#empty-reset').addEventListener('click', () => { resetFilters(); $('.type-button').focus(); });
  gallery.addEventListener('click', event => {
    const button = event.target.closest('[data-card]');
    if (button) showCard(button.dataset.card);
  });
  $('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { if (lastFocusedCard?.isConnected) lastFocusedCard.focus(); });

  render();

  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const types = ['all', 'debit', 'credit'];
    const networks = ['all', 'visa', 'mastercard', 'unionpay', 'amex', 'jcb', 'discover'];
    const banks = ['all', ...new Set(cards.map(card => card.bank))];
    const tool = {
      name: 'filter_card_gallery',
      title: '筛选卡片画廊',
      description: 'Apply search, card type, bank, and payment network filters to the visible card gallery. Omitted filters reset to all. Returns the matching card names and banks.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: 200, description: 'Card name, bank, or visual keyword, such as 雪山 or 海洋.' },
          type: { type: 'string', enum: types },
          bank: { type: 'string', enum: banks },
          network: { type: 'string', enum: networks }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('筛选条件必须是对象。');
        const allowed = ['query', 'type', 'bank', 'network'];
        if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('存在不支持的筛选条件。');
        const next = { query: '', type: 'all', bank: 'all', network: 'all', ...input };
        if (typeof next.query !== 'string' || next.query.length > 200) throw new Error('搜索关键词须为 200 字以内的文本。');
        if (!types.includes(next.type) || !banks.includes(next.bank) || !networks.includes(next.network)) throw new Error('请选择有效的卡片类型、银行和卡组织。');
        if (dialog.open) dialog.close();
        closePicker();
        Object.assign(state, next);
        search.value = next.query;
        render();
        return { count: visibleCards.length, cards: visibleCards.map(({ id, name, bank }) => ({ id, name, bank })) };
      }
    };
    try {
      Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* The gallery also works without browser tool support. */ }
    window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); });
  }
})();
