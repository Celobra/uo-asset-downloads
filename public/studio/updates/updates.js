'use strict';
const filters = document.querySelector('.update-filters');
const search = document.querySelector('#update-search');
const kind = document.querySelector('#update-kind');
if (window.matchMedia('(max-width: 760px)').matches) document.querySelector('.release-index details').open = false;
const entries = [...document.querySelectorAll('.release-entry')].map(article => ({
  article,
  heading: (article.querySelector('h2').textContent + ' ' + article.querySelector('.version-link').textContent).toLocaleLowerCase(),
  groups: [...article.querySelectorAll('.change-group')].map(group => ({
    group,
    items: [...group.querySelectorAll('li')].map(item => ({ item, text:item.textContent.toLocaleLowerCase() }))
  }))
}));
function filterUpdates() {
  const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let versions = 0, changes = 0;
  for (const entry of entries) {
    let visible = 0;
    for (const { group, items } of entry.groups) {
      let count = 0;
      for (const { item, text } of items) {
        const matches = (kind.value === 'all' || kind.value === group.dataset.kind) && words.every(word => (entry.heading + ' ' + text).includes(word));
        item.hidden = !matches;
        if (matches) count++;
      }
      group.hidden = count === 0;
      visible += count;
    }
    entry.article.hidden = visible === 0;
    if (visible) versions++;
    changes += visible;
  }
  document.querySelector('#update-count').textContent = `${changes} ${changes === 1 ? 'change' : 'changes'} in ${versions} ${versions === 1 ? 'version' : 'versions'}`;
  document.querySelector('#no-updates').hidden = versions !== 0;
}
function resetFilters() { search.value = ''; kind.value = 'all'; filterUpdates(); }
search.addEventListener('input', filterUpdates);
kind.addEventListener('change', filterUpdates);
document.querySelector('#reset-updates').addEventListener('click', () => { resetFilters(); search.focus(); });
document.querySelector('.release-index').addEventListener('click', event => {
  if (event.target.closest('a')) resetFilters();
});
window.addEventListener('hashchange', () => {
  const entry = entries.find(entry => '#' + entry.article.id === location.hash);
  if (entry?.article.hidden) { resetFilters(); entry.article.scrollIntoView(); }
});
filters.hidden = false;
filterUpdates();
