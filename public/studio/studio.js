'use strict';
const viewer = document.querySelector('#image-dialog');
let openedBy = null;
document.querySelectorAll('.enlarge').forEach(button => {
  button.addEventListener('click', () => {
    const figure = button.closest('figure');
    const original = figure.querySelector('img');
    const image = viewer.querySelector('img');
    image.src = original.src;
    image.alt = original.alt;
    viewer.querySelector('p').textContent = figure.querySelector('figcaption').textContent;
    openedBy = button;
    viewer.showModal();
  });
});
viewer?.querySelector('.close').addEventListener('click', () => viewer.close());
viewer?.addEventListener('close', () => { openedBy?.focus(); });
viewer?.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
// Walkthroughs are user-initiated; nothing animates on page load or for reduced motion.
document.querySelectorAll('.motion-toggle').forEach(button => {
  const image = button.closest('figure').querySelector('img');
  const still = image.src;
  button.addEventListener('click', () => {
    const playing = button.getAttribute('aria-pressed') === 'true';
    image.src = playing ? still : button.dataset.gif;
    button.setAttribute('aria-pressed', String(!playing));
    button.textContent = playing ? 'Play walkthrough ▷' : 'Stop walkthrough □';
  });
});
