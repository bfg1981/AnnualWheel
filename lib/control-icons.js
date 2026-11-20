const controlIcons = Object.freeze({
  edit: '✎',
  remove: '🗑️',
  add: '➕',
  confirm: '✅',
  cancel: '🚫',
  close: '×',
  arrow: '→',
  previous: '‹',
  next: '›',
  settings: '••',
  zoomIn: '+',
  zoomOut: '−',
});

function setControlIcon(element, name) {
  element.dataset.icon = name;
  element.textContent = controlIcons[name];
}

for (const element of document.querySelectorAll('[data-icon]')) setControlIcon(element, element.dataset.icon);
