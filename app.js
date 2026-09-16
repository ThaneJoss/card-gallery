(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const networkOptions = [
    {value:'visa',label:'Visa'}, {value:'mastercard',label:'Mastercard'},
    {value:'unionpay',label:'银联 UnionPay'}, {value:'amex',label:'American Express'},
    {value:'jcb',label:'JCB'}, {value:'discover',label:'Discover'}
  ];
  const supportedNetworks = new Set(networkOptions.map(option => option.value));

  function readCards(data) {
    if (!Array.isArray(data)) throw new Error('卡片资料未加载，请确认已发布完整的网站文件后重试。');
    const ids = new Set();
    return Array.from(data, (item, index) => {
      const label = `第 ${index + 1} 张卡片`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label}必须是一个对象。`);
      const text = (field, required = true) => {
        const value = item[field];
        if (!required && (value === undefined || value === null)) return '';
        if (typeof value !== 'string' || (required && !value.trim())) throw new Error(`${label}的 ${field} 必须是${required ? '非空' : ''}字符串。`);
        return value.trim();
      };
      const imagePath = (field, required = true) => {
        const value = text(field, required);
        if (!value) return '';
        let url;
        try { url = new URL(value, document.baseURI); } catch { throw new Error(`${label}的 ${field} 图片路径无效。`); }
        const protocols = location.protocol === 'file:' ? ['file:', 'https:', 'http:'] : ['https:', 'http:'];
        if (!protocols.includes(url.protocol)) throw new Error(`${label}的 ${field} 请使用相对路径或 HTTP(S) 图片地址。`);
        return value;
      };
      const id = text('id');
      if (ids.has(id)) throw new Error(`${label}的 id「${id}」重复，每张卡片需要唯一的 id。`);
      ids.add(id);
      const type = text('type');
      if (!['credit', 'debit'].includes(type)) throw new Error(`${label}的 type 只能是 credit 或 debit。`);
      const networks = item.networks ?? [];
      if (!Array.isArray(networks) || ![...networks].every(network => supportedNetworks.has(network))) throw new Error(`${label}的 networks 须为卡组织数组：${[...supportedNetworks].join('、')}。`);
      const keywords = item.keywords ?? '';
      if (typeof keywords !== 'string' && !(Array.isArray(keywords) && [...keywords].every(word => typeof word === 'string'))) throw new Error(`${label}的 keywords 须为字符串或字符串数组。`);
      return {
        id, name: text('name'), bank: text('bank'), type,
        networks: [...new Set(networks)],
        keywords: Array.isArray(keywords) ? keywords.join(' ') : keywords,
        image: imagePath('image'), bankLogo: imagePath('bankLogo', false)
      };
    });
  }

  let cards;
  try {
    cards = readCards(window.CARD_GALLERY_DATA);
  } catch (error) {
    $('#data-status').hidden = false;
    $('#data-message').textContent = error.message;
    return;
  }

  const state = { type:'all', bank:'all', network:'all', query:'' };
  let visibleCards = [...cards];
  let renderedCardIds = '';
  let lastFocusedCard = null;
  const gallery = $('#gallery');
  const dialog = $('#card-dialog');
  const search = $('#search-input');
  let activePicker = null;
  const cardRatio = 85.6 / 53.98;

  const escapeHTML = (text) => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const cardArt = (card, {lazy = false, priority = false} = {}) => {
    return `<span class="card-art"><img data-card-image src="${escapeHTML(card.image)}" alt="${escapeHTML(`${card.bank} ${card.name}卡面`)}" draggable="false" decoding="async" loading="${lazy ? 'lazy' : 'eager'}" fetchpriority="${priority ? 'high' : 'auto'}"><span class="image-fallback" hidden>卡面暂不可用</span></span>`;
  };

  const bankNames = [...new Set(cards.map(card => card.bank))];
  const bankLogos = new Map();
  for (const card of cards) {
    if (card.bankLogo && !bankLogos.has(card.bank)) bankLogos.set(card.bank, card.bankLogo);
  }
  const genericIcons = {
    bank:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-6 9 6H3ZM4 21h16M6 11v7M10 11v7M14 11v7M18 11v7"/></svg>',
    network:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h3"/></svg>'
  };
  const fallbackBankLogo = (bank) => `<span class="bank-logo bank-logo-fallback" role="img" aria-label="${escapeHTML(bank)}" title="${escapeHTML(bank)}">${genericIcons.bank}</span>`;
  const bankLogo = (bank) => bankLogos.has(bank)
    ? `<img class="bank-logo" data-bank-logo src="${escapeHTML(bankLogos.get(bank))}" alt="${escapeHTML(bank)}" title="${escapeHTML(bank)}" draggable="false">`
    : fallbackBankLogo(bank);
  const pickerOptions = {
    bank:[{value:'all',label:'全部银行'}, ...bankNames.map(bank => ({value:bank,label:bank,logo:bankLogos.get(bank)}))],
    network:[{value:'all',label:'全部卡组织'}, ...networkOptions.map(item => ({...item,logo:`./assets/logos/networks/${item.value}.svg`}))]
  };
  const optionIcon = (kind, option) => option.logo ? `<img src="${escapeHTML(option.logo)}" data-option-icon="${kind}" alt="" draggable="false">` : genericIcons[kind];

  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    if (image.hasAttribute('data-card-image')) {
      image.hidden = true;
      image.nextElementSibling.hidden = false;
    } else if (image.hasAttribute('data-bank-logo')) {
      image.outerHTML = fallbackBankLogo(image.alt);
    } else if (image.dataset.optionIcon) {
      image.outerHTML = genericIcons[image.dataset.optionIcon];
    }
  }, true);

  function syncPickers() {
    for (const kind of ['bank','network']) {
      const selected = pickerOptions[kind].find(option => option.value === state[kind]);
      $(`#${kind}-picker-label`).textContent = selected.label;
      $(`#${kind}-picker-icon`).innerHTML = optionIcon(kind, selected);
      const trigger = $(`#${kind}-trigger`);
      trigger.title = selected.label;
      trigger.classList.toggle('is-filtered', state[kind] !== 'all');
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
  $('#count-all').textContent = cards.length;
  $('#count-debit').textContent = cards.filter(card => card.type === 'debit').length;
  $('#count-credit').textContent = cards.filter(card => card.type === 'credit').length;

  function matches(card, filters = state) {
    const words = filters.query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const networkNames = card.networks.map(network => pickerOptions.network.find(option => option.value === network).label);
    const typeNames = card.type === 'debit' ? 'debit 储蓄卡 借记卡' : 'credit 信用卡';
    const haystack = [card.name, card.bank, card.keywords, typeNames, ...card.networks, ...networkNames].join(' ').normalize('NFKC').toLocaleLowerCase();
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
    syncPickers();
    $('#clear-search').hidden = search.value.length === 0;
    const nextCardIds = JSON.stringify(visibleCards.map(card => card.id));
    if (renderedCardIds !== nextCardIds) {
      gallery.innerHTML = visibleCards.map((card, index) => `<article class="gallery-card" style="--index:${Math.min(index, 5)}"><button class="card-button" type="button" data-card="${escapeHTML(card.id)}" aria-haspopup="dialog" aria-label="查看${escapeHTML(card.bank)}${escapeHTML(card.name)}卡面">${cardArt(card, {lazy:index >= 3, priority:index === 0})}<span class="card-caption"><span class="card-name">${escapeHTML(card.name)}</span><span class="card-bank">${bankLogo(card.bank)}</span></span></button></article>`).join('');
      renderedCardIds = nextCardIds;
    }
    const filtered = state.type !== 'all' || state.bank !== 'all' || state.network !== 'all' || state.query.trim() !== '';
    $('#reset-filters').hidden = !filtered;
    $('#results-text').textContent = filtered
      ? `找到 ${visibleCards.length} 张卡片${state.query.trim() ? ` · “${state.query.trim()}”` : ''}`
      : `全部 ${cards.length} 张卡片 · ${bankNames.length} 家银行`;
    $('#empty-state').hidden = visibleCards.length !== 0;
    $('#empty-state h2').textContent = cards.length ? '还没有找到这张卡' : '还没有收录卡片';
    $('#empty-state p').textContent = cards.length ? '试试其他关键词，或调整筛选条件。' : '收录的卡片会显示在这里。';
    $('#empty-reset').hidden = cards.length === 0;
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
    $('#detail-art').innerHTML = cardArt(card, {priority:true});
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
    if (dialog.open) fitDialog();
  }
  window.addEventListener('resize',handleViewportChange,{passive:true});
  window.addEventListener('scroll',() => closePicker(),{passive:true});
  window.visualViewport?.addEventListener('resize',handleViewportChange,{passive:true});

  $('.type-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-type]');
    if (button) { state.type = button.dataset.type; render(); }
  });
  document.addEventListener('keydown', event => {
    const editing = event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea, select'));
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !editing && !dialog.open) {
      event.preventDefault();
      closePicker();
      search.focus();
    }
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
  dialog.addEventListener('close', () => { if (lastFocusedCard?.isConnected) lastFocusedCard.focus({preventScroll:true}); });

  render();
  $('.filters').hidden = false;
  $('.results-note').hidden = false;

  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const types = ['all', 'debit', 'credit'];
    const networks = ['all', ...supportedNetworks];
    const banks = ['all', ...bankNames];
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
