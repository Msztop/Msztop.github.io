(() => {
  "use strict";

  const head = document.querySelector(".site-head");
  const menu = document.querySelector(".mobile-nav");
  const filters = document.querySelector(".filters");
  const entries = Array.from(document.querySelectorAll(".entry"));
  document.documentElement.classList.add("enhanced");

  function updateHeader() {
    head.classList.toggle("scrolled", window.scrollY > 40);
  }
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
  document.addEventListener("click", (event) => {
    if (menu.open && (!menu.contains(event.target) || event.target.closest("a"))) {
      menu.open = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });

  function setFilter(topic) {
    let count = 0;
    for (const entry of entries) {
      entry.hidden = topic !== "all" && entry.dataset.topic !== topic;
      if (!entry.hidden) count++;
    }
    for (const button of filters.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.filter === topic));
    }
    document.getElementById("filter-result").textContent = "显示 " + count + " 篇笔记";
  }
  filters.hidden = entries.length === 0;
  document.getElementById("notes-empty").hidden = entries.length > 0;
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (button) setFilter(button.dataset.filter);
  });
  function openLinkedNote() {
    const entry = entries.find((item) => "#" + item.id === location.hash);
    if (!entry) return;
    if (entry.hidden) setFilter("all");
    entry.open = true;
    entry.scrollIntoView({ block: "start", behavior: "instant" });
  }
  window.addEventListener("hashchange", openLinkedNote);
  openLinkedNote();

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = path;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  async function source(path) {
    const response = await fetch("contents/" + path);
    if (!response.ok || (response.headers.get("content-type") || "").includes("text/html")) {
      throw new Error("Unavailable content: " + path);
    }
    return response.text();
  }

  function applyConfig(config) {
    for (const key of ["title", "page-top-title", "top-section-bg-text", "home-subtitle", "copyright-text"]) {
      if (typeof config[key] !== "string") continue;
      const text = document.createElement("template");
      text.innerHTML = config[key];
      const value = text.content.textContent.trim();
      if (!value) continue;
      const node = document.getElementById(key);
      if (key === "page-top-title") node.setAttribute("aria-label", value + " 的主页");
      else node.textContent = value;
    }
  }

  const headingNames = {
    "Contact": "联系方式", "Education": "教育背景", "Research Interests": "研究兴趣",
    "Submitted": "已投稿", "Published": "已发表"
  };
  async function renderSection(name) {
    const markdown = await source(name + ".md");
    const region = document.getElementById(name + "-md");
    const content = document.createElement("template");
    content.innerHTML = window.marked.parse(markdown);
    const headings = Array.from(content.content.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    for (const heading of headings.reverse()) {
      const next = heading.nextElementSibling;
      if (!next || (/^H[1-6]$/.test(next.tagName) && next.tagName <= heading.tagName)) {
        heading.remove();
      } else if (Object.prototype.hasOwnProperty.call(headingNames, heading.textContent.trim())) {
        heading.textContent = headingNames[heading.textContent.trim()];
      }
    }
    if (content.content.children.length) {
      region.replaceChildren(content.content);
    } else if (name === "home") {
      region.replaceChildren();
      region.hidden = true;
    }
    return { region, hasMath: /\$\$|\$[^$\n]+\$|\\\(|\\\[|\\begin\{/.test(markdown) };
  }

  async function renderNote(entry) {
    const region = entry.querySelector(".note-body");

    try {
        const markdown = await source(entry.dataset.source);
        region.innerHTML = window.marked.parse(markdown);

        return {
            region,
            hasMath: /\$|\\\(|\\\[|\\begin\{/.test(markdown)
        };
    } catch (error) {
        region.textContent = "文章加载失败。";
        console.error(error);
        throw error;
    }
}
  async function hydrateSections() {
    if (!window.marked) return;
    window.marked.use({ mangle: false, headerIds: false });
    const results = await Promise.allSettled([
    ...["home", "publications", "awards"].map(renderSection),
    ...entries.filter(entry => entry.dataset.source).map(renderNote)
]);
    const mathRegions = results.filter((item) => item.status === "fulfilled" && item.value.hasMath)
      .map((item) => item.value.region);
    if (!mathRegions.length) return;
    window.MathJax = {
      tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], processEscapes: false, tags: "all" },
      startup: { typeset: false }
    };
    await loadScript("static/js/tex-svg.js");
    await window.MathJax.startup.promise;
    await window.MathJax.typesetPromise(mathRegions);
  }

  if (["https:", "http:"].includes(location.protocol)) {
    const configReady = source("config.yml").then((yaml) => applyConfig(window.jsyaml.load(yaml) || {}));
    Promise.allSettled([configReady, hydrateSections()]);
  }
})();
