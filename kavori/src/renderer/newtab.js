const q = new URLSearchParams(location.search);
document.documentElement.dataset.theme = q.get('t') || 'light';
const { h, kbds } = UI;
const name = q.get('n') || '', color = q.get('c') || 'c-blue';
document.getElementById('nt').append(
  h('span.tile.tile-lg.' + color, UI.glyphOf(name)),
  h('h1', name),
  h('p', 'Press ', kbds(['⌘', 'K']), ' to open a site or search.'));
