import { CARD_VIEWS, ELEMENT_KINDS } from './card-studio.mjs';

export function createCardStudio({ onViewChange, onSpacingChange, onVisibilityChange }) {
  const $ = selector => document.querySelector(selector);
  const options = $('#card-view-options'), panel = $('#studio-panel'), list = $('#layer-list');
  const map = $('#layer-map'), spacing = $('#layer-spacing'), downloads = $('#studio-downloads');
  let activeCard = null, view = 'original', busy = false;
  const hiddenLayers = new Set();
  const escape = text => String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);

  function selectLayer(id) {
    const element = activeCard.studio.elements.find(item => item.id === id);
    if (!element) return;
    list.querySelectorAll('[data-layer-row]').forEach(row => row.classList.toggle('is-selected', row.dataset.layerRow === id));
    list.querySelectorAll('[data-layer-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layerSelect === id)));
    map.querySelectorAll('[data-layer-select]').forEach(button => {
      button.classList.toggle('is-selected', button.dataset.layerSelect === id);
      button.setAttribute('aria-pressed', String(button.dataset.layerSelect === id));
    });
    $('#selected-layer-preview').src = element.image;
    $('#selected-layer-preview').alt = `${element.label}透明图层`;
    $('#selected-layer-title').textContent = element.label;
    const [x, y, width, height] = element.pixels;
    $('#selected-layer-position').textContent = `X ${x} · Y ${y} · ${width} × ${height} px`;
    $('#selected-layer-text').textContent = element.text || ELEMENT_KINDS[element.kind];
    $('#selected-layer-download').href = element.image;
    $('#selected-layer-download').download = `${activeCard.id}-${element.id}.png`;
  }

  function showView(next) {
    view = next;
    options.querySelectorAll('[data-card-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cardView === view)));
    panel.hidden = view !== 'layers';
    $('#card-dialog').classList.toggle('has-layer-panel', view === 'layers');
    $('#detail-view-name').textContent = CARD_VIEWS[view];
    $('#viewer-help').textContent = view === 'layers'
      ? '拖动观察图层分离 · 图层面板可单独隐藏元素 · Home 复位'
      : '拖动或用方向键 360° 环绕 · Home 复位';
    const file = view === 'original' ? activeCard.image : view === 'hd' ? activeCard.studio.hd : activeCard.studio.clean;
    $('#download-current').href = file;
    $('#download-current').download = `${activeCard.id}-${view === 'layers' ? 'clean' : view}.webp`;
  }

  function setCard(card) {
    activeCard = card;
    hiddenLayers.clear();
    spacing.value = '55';
    $('#layer-spacing-value').textContent = '55%';
    const ready = card.studio?.status === 'ready';
    options.hidden = !ready;
    downloads.hidden = !ready;
    $('#studio-description').hidden = !ready;
    $('#detail-asset-note').textContent = ready
      ? `${card.studio.width} × ${card.studio.height} · ${card.studio.elements.length} 个透明图层`
      : card.studio?.status === 'placeholder' ? '卡面原图待补充' : '原始卡面';
    list.replaceChildren();
    map.replaceChildren();
    if (ready) {
      const studio = card.studio;
      options.querySelector('[data-card-view="layers"]').disabled = studio.elements.length === 0;
      $('#layer-count').textContent = studio.elements.length;
      $('#download-hd').href = studio.hd;
      $('#download-hd').download = `${card.id}-hd.webp`;
      $('#download-clean').href = studio.clean;
      $('#download-clean').download = `${card.id}-clean.webp`;
      $('#download-coordinates').href = studio.manifest;
      $('#download-coordinates').download = `${card.id}-layers.json`;
      map.innerHTML = `<img src="${escape(studio.hd)}" alt="图层在完整高清卡面中的位置" draggable="false">` + studio.elements.map((element, index) => {
        const [x, y, width, height] = element.box.map(value => value * 100);
        return `<button type="button" class="layer-region" data-layer-select="${escape(element.id)}" style="left:${x}%;top:${y}%;width:${width}%;height:${height}%" aria-label="定位${escape(element.label)}"><span>${index + 1}</span></button>`;
      }).join('');
      list.innerHTML = studio.elements.map((element, index) => `<li data-layer-row="${escape(element.id)}">
        <label class="layer-visibility"><input type="checkbox" checked data-layer-visible="${escape(element.id)}" aria-label="显示${escape(element.label)}"></label>
        <button class="layer-select" type="button" data-layer-select="${escape(element.id)}" aria-pressed="false">
          <span class="layer-thumbnail transparency"><img src="${escape(element.image)}" alt="" loading="lazy"></span>
          <span class="layer-caption"><strong>${index + 1}. ${escape(element.label)}</strong><small>${ELEMENT_KINDS[element.kind]}</small></span>
        </button>
        <a class="layer-download" href="${escape(element.image)}" download="${escape(card.id)}-${escape(element.id)}.png" aria-label="下载${escape(element.label)}透明图层">PNG <span aria-hidden="true">↓</span></a>
      </li>`).join('');
      $('#selected-layer').hidden = studio.elements.length === 0;
      if (studio.elements.length) selectLayer(studio.elements[0].id);
    }
    showView(ready ? 'hd' : 'original');
    return view;
  }

  options.addEventListener('click', event => {
    const button = event.target.closest('[data-card-view]');
    if (!button || button.disabled || button.dataset.cardView === view) return;
    showView(button.dataset.cardView);
    onViewChange(view);
  });
  panel.addEventListener('click', event => {
    const preview = event.target.closest('[data-preview-background]');
    if (preview) {
      $('.selected-layer-art').classList.toggle('is-dark', preview.dataset.previewBackground === 'dark');
      panel.querySelectorAll('[data-preview-background]').forEach(button => button.setAttribute('aria-pressed', String(button === preview)));
    }
    const button = event.target.closest('[data-layer-select]');
    if (button) selectLayer(button.dataset.layerSelect);
    const action = event.target.closest('[data-layers-visible]');
    if (action && !busy) {
      const visible = action.dataset.layersVisible === 'true';
      list.querySelectorAll('[data-layer-visible]').forEach(input => {
        input.checked = visible;
        if (visible) hiddenLayers.delete(input.dataset.layerVisible);
        else hiddenLayers.add(input.dataset.layerVisible);
        onVisibilityChange(input.dataset.layerVisible, visible);
      });
    }
  });
  list.addEventListener('change', event => {
    const input = event.target.closest('[data-layer-visible]');
    if (!input) return;
    if (input.checked) hiddenLayers.delete(input.dataset.layerVisible);
    else hiddenLayers.add(input.dataset.layerVisible);
    onVisibilityChange(input.dataset.layerVisible, input.checked);
  });
  spacing.addEventListener('input', () => {
    $('#layer-spacing-value').textContent = `${spacing.value}%`;
    onSpacingChange(Number(spacing.value) / 100);
  });
  return { setCard,
    setBusy(value) {
      busy = value;
      panel.querySelectorAll('input, [data-layers-visible]').forEach(control => { control.disabled = value; });
    },
    applyTo(viewer) {
      viewer.setLayerSpacing(Number(spacing.value) / 100);
      hiddenLayers.forEach(id => viewer.setLayerVisibility(id, false));
    }
  };
}
