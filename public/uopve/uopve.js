(() => {
  "use strict";

  const normalize = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

  // The complete indexes remain readable when JavaScript is unavailable.
  const enableFilter = ({ inputId, entrySelector, resultsId, emptyId, categoryId, noun }) => {
    const input = document.getElementById(inputId);
    const entries = Array.from(document.querySelectorAll(entrySelector));
    if (!input || entries.length === 0) return;

    const results = document.getElementById(resultsId);
    const empty = document.getElementById(emptyId);
    const category = categoryId ? document.getElementById(categoryId) : null;
    const index = entries.map((element) => ({
      element,
      search: normalize(element.dataset.search || element.textContent),
      category: normalize(element.dataset.category),
    }));

    if (results) {
      results.setAttribute("role", "status");
      results.setAttribute("aria-live", "polite");
      results.setAttribute("aria-atomic", "true");
    }

    const update = () => {
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      const selectedCategory = category ? normalize(category.value) : "";
      let visible = 0;

      for (const item of index) {
        const matchesCategory = !selectedCategory || selectedCategory === "all" || item.category === selectedCategory;
        const matchesSearch = terms.every((term) => item.search.includes(term));
        const matches = matchesCategory && matchesSearch;
        item.element.hidden = !matches;
        if (matches) visible += 1;
      }

      if (results) results.textContent = `${visible} ${visible === 1 ? noun : noun === 'entry' ? 'entries' : noun + 's'}${terms.length || (selectedCategory && selectedCategory !== "all") ? " found" : " available"}`;
      if (empty) empty.hidden = visible !== 0;
    };

    input.addEventListener("input", update);
    input.addEventListener("search", update);
    if (category) category.addEventListener("change", update);
    window.addEventListener("pageshow", update);
    update();
  };

  const initialize = () => {
    enableFilter({ inputId: 'bestiary-search', entrySelector: '[data-bestiary-entry]', resultsId: 'bestiary-results', emptyId: 'bestiary-empty', categoryId: 'bestiary-category', noun: 'creature' });
    for (const input of document.querySelectorAll('[data-reference-filter]')) {
      const prefix = input.dataset.referenceFilter;
      enableFilter({ inputId: input.id, entrySelector: `[data-reference-entry="${prefix}"]`, resultsId: `${prefix}-results`, emptyId: `${prefix}-empty`, noun: 'entry' });
    }
    enableFilter({
      inputId: "wiki-search",
      entrySelector: "[data-wiki-entry]",
      resultsId: "wiki-results",
      emptyId: "wiki-empty",
      categoryId: "wiki-category",
      noun: "article",
    });

    enableFilter({
      inputId: "update-search",
      entrySelector: "[data-update-entry]",
      resultsId: "update-results",
      emptyId: "update-empty",
      noun: "update",
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
