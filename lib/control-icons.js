const controlIcons = Object.freeze({
  dependency: '↗',
  deadline: '🗓️',
  virtualDate: '⚓',
  group: '⛶',
  constraint: '⏷',
  edit: '✎',
  remove: { src: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#f44336"/><path d="m8 8 8 8m0-8-8 8" fill="none" stroke="white" stroke-width="2.5"/></svg>'
  ) },
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
  const icon = controlIcons[name];
  if (typeof icon === 'string') {
    element.textContent = icon;
  } else if (element.localName === 'image') {
    element.setAttribute('href', icon.src);
  } else {
    const image = document.createElement('img');
    image.src = icon.src;
    image.alt = '';
    element.replaceChildren(image);
  }
}

for (const element of document.querySelectorAll('[data-icon]')) setControlIcon(element, element.dataset.icon);
