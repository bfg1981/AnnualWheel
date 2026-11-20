// Coordinates are relative to the scrolling timeline's SVG.
export function addDependencyHandles(path, startDrag) {
  const group = path.parentNode;
  const ends = [path.getPointAtLength(0), path.getPointAtLength(path.getTotalLength())];
  for (const [index, end] of ends.entries()) {
    const handle = document.createElementNS(path.namespaceURI, 'circle');
    const side = index ? 'target' : 'source';
    handle.dataset.dragEnd = side;
    handle.setAttribute('cx', end.x);
    handle.setAttribute('cy', end.y);
    handle.setAttribute('r', '6');
    handle.onpointerdown = event => startDrag(event, side, ends[1 - index]);
    group.insertBefore(handle, group.querySelector('text'));
  }
  path.classList.add('draggable-dependency');
  const hit = document.createElementNS(path.namespaceURI, 'path');
  hit.setAttribute('d', path.getAttribute('d'));
  hit.setAttribute('class', 'dependency-hit-area');
  group.prepend(hit);
  path.onpointerdown = hit.onpointerdown = event => {
    const origin = path.ownerSVGElement.getBoundingClientRect();
    const distance = point => Math.hypot(event.clientX - origin.left - point.x, event.clientY - origin.top - point.y);
    const source = distance(ends[0]) < distance(ends[1]);
    startDrag(event, source ? 'source' : 'target', ends[source ? 1 : 0]);
  };
}

export function dragDependency(event, fixed, svg, viewport, candidates, commit) {
  if (event.button !== 0 || !event.isPrimary || !candidates.size) return;
  event.preventDefault();
  const { pointerId } = event;
  const line = document.createElementNS(svg.namespaceURI, 'path');
  line.classList.add('dependency-rubberband');
  svg.append(line);
  for (const node of candidates.keys()) node.classList.add('dependency-drop-option');
  svg.setPointerCapture(pointerId);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let x = event.clientX, y = event.clientY, frame, hovered, moved = false;

  function update() {
    const box = svg.getBoundingClientRect();
    line.setAttribute('d', `M ${fixed.x} ${fixed.y} L ${x - box.left} ${y - box.top}`);
    let next;
    for (const element of document.elementsFromPoint(x, y)) {
      const node = element.closest('.deadline-card, .timeline-weekday, .timeline-initial > div, .timeline-start');
      if (node && candidates.has(node)) {
        next = node;
        break;
      }
    }
    if (next !== hovered) {
      hovered?.classList.remove('dependency-drop-hover');
      next?.classList.add('dependency-drop-hover');
      hovered = next;
    }
  }
  function scroll() {
    const box = viewport.getBoundingClientRect();
    const step = (position, low, high) => position < low + 36 ? -12 : position > high - 36 ? 12 : 0;
    viewport.scrollLeft += step(x, box.left, box.right);
    window.scrollBy(0, step(y, 0, window.innerHeight));
    update();
    frame = requestAnimationFrame(scroll);
  }
  function stop() {
    listeners.abort();
    cancelAnimationFrame(frame);
    if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
    line.remove();
    for (const node of candidates.keys()) node.classList.remove('dependency-drop-option', 'dependency-drop-hover');
  }
  svg.addEventListener('pointercancel', cancel => { if (cancel.pointerId === pointerId) stop(); }, options);
  svg.addEventListener('pointermove', move => {
    if (move.pointerId !== pointerId) return;
    x = move.clientX; y = move.clientY;
    if (!moved && Math.hypot(x - event.clientX, y - event.clientY) >= 4) {
      moved = true;
      scroll();
    }
  }, options);
  svg.addEventListener('pointerup', up => {
    if (up.pointerId !== pointerId) return;
    x = up.clientX; y = up.clientY; update();
    const value = candidates.get(hovered);
    stop();
    if (moved && value) commit(value);
  }, options);
  svg.addEventListener('lostpointercapture', lost => { if (lost.pointerId === pointerId) stop(); }, options);
  window.addEventListener('blur', stop, options);
  document.addEventListener('keydown', key => {
    if (key.key === 'Escape') { key.preventDefault(); stop(); }
  }, options);
  return stop;
}
