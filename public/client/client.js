const dialog = document.querySelector('#screenshot-dialog');
const image = document.querySelector('#screenshot-image');
const caption = document.querySelector('#screenshot-caption');
for (const link of document.querySelectorAll('.shot-link')) {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    caption.textContent = link.dataset.caption;
    dialog.showModal();
  });
}
document.querySelector('#close-screenshot').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
