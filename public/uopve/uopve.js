(() => {
  "use strict";

  const normalize = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

  // The complete indexes remain readable when JavaScript is unavailable.
  const filters = [];
  const enableFilter = ({ inputId, entrySelector, resultsId, emptyId, categoryId, noun, groupSelector, groupLinkSelector, groupsOnlyWhenActive = false }) => {
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
    const groups = groupSelector ? Array.from(document.querySelectorAll(groupSelector)).map(element => ({
      element,
      entries: entries.filter(entry => element.contains(entry)),
      count: element.querySelector?.("[data-wiki-topic-count]"),
    })) : [];
    const groupLinks = groupLinkSelector ? Array.from(document.querySelectorAll(groupLinkSelector)) : [];

    if (results) {
      results.setAttribute("role", "status");
      results.setAttribute("aria-live", "polite");
      results.setAttribute("aria-atomic", "true");
    }

    const update = () => {
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      const selectedCategory = category ? normalize(category.value) : "";
      const active = terms.length > 0 || Boolean(selectedCategory && selectedCategory !== "all");
      let visible = 0;

      for (const item of index) {
        const matchesCategory = !selectedCategory || selectedCategory === "all" || item.category === selectedCategory;
        const matchesSearch = terms.every((term) => item.search.includes(term));
        const matches = matchesCategory && matchesSearch;
        item.element.hidden = !matches;
        if (matches) visible += 1;
      }

      for (const group of groups) {
        const groupVisible = group.entries.filter(entry => !entry.hidden).length;
        group.element.hidden = (!groupsOnlyWhenActive || active) && groupVisible === 0;
        if (group.count) group.count.textContent = `${groupVisible} guide${groupVisible === 1 ? "" : "s"}`;
        for (const link of groupLinks) {
          if (link.dataset.wikiTopicLink === group.element.id) link.hidden = group.element.hidden;
        }
      }

      if (results) results.textContent = `${visible} ${visible === 1 ? noun : noun === 'entry' ? 'entries' : noun + 's'}${active ? " found" : " available"}`;
      if (empty) empty.hidden = visible !== 0;
    };

    input.addEventListener("input", update);
    input.addEventListener("search", update);
    if (category) category.addEventListener("change", update);
    window.addEventListener("pageshow", update);
    update();
    filters.push({
      reveal(target) {
        const hidesTarget = entries.some(entry => entry.hidden && (entry === target || entry.contains?.(target)))
          || groups.some(group => group.element.hidden && (group.element === target || group.element.contains(target)
            || (target.tagName === "SECTION" && target.contains?.(group.element))));
        if (!hidesTarget) return;
        input.value = "";
        if (category) category.value = "all";
        update();
      },
    });
  };

  const revealHash = (hash = window.location?.hash, shouldScroll = true) => {
    if (!hash || hash === "#") return;
    let id;
    try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    for (const filter of filters) filter.reveal(target);
    for (let element = target; element; element = element.parentElement) {
      if (element.tagName === "DETAILS") element.open = true;
    }
    if (!shouldScroll) return;
    // Wait until expanded details and restored rows participate in layout.
    const scroll = () => target.scrollIntoView?.({ block: "start" });
    if (window.requestAnimationFrame) window.requestAnimationFrame(scroll);
    else scroll();
  };

  const initialize = () => {
    enableFilter({ inputId: 'bestiary-search', entrySelector: '[data-bestiary-entry]', resultsId: 'bestiary-results', emptyId: 'bestiary-empty', categoryId: 'bestiary-category', noun: 'creature' });
    for (const input of document.querySelectorAll('[data-reference-filter]')) {
      const prefix = input.dataset.referenceFilter;
      enableFilter({ inputId: input.id, entrySelector: `[data-reference-entry="${prefix}"]`, resultsId: `${prefix}-results`, emptyId: `${prefix}-empty`, noun: 'entry', groupSelector: `[data-reference-section="${prefix}"]`, groupsOnlyWhenActive: true });
    }
    enableFilter({
      inputId: "wiki-search",
      entrySelector: "[data-wiki-entry]",
      resultsId: "wiki-results",
      emptyId: "wiki-empty",
      categoryId: "wiki-category",
      noun: "guide",
      groupSelector: "[data-wiki-topic]",
      groupLinkSelector: "[data-wiki-topic-link]",
    });

    enableFilter({
      inputId: "update-search",
      entrySelector: "[data-update-entry]",
      resultsId: "update-results",
      emptyId: "update-empty",
      noun: "update",
    });

    for (const contents of document.querySelectorAll("[data-wiki-contents]")) {
      contents.open = Boolean(window.matchMedia?.("(min-width: 900px)").matches);
    }
    window.addEventListener("hashchange", () => revealHash());
    // Back navigation restores the reader's filters and scroll position.
    window.addEventListener("pageshow", event => {
      if (!event?.persisted) revealHash(window.location?.hash, false);
    });
    document.addEventListener("click", event => {
      if (event.defaultPrevented || (event.button != null && event.button !== 0) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = event.target?.closest?.("a[href]")?.getAttribute("href");
      if (href?.startsWith("#")) revealHash(href);
    });
    revealHash();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
