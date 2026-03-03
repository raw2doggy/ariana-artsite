/**
 * main.js — Dynamic Content Loader & Slideshow
 *
 * Fetches admin-managed content from the server API and renders it
 * onto the public-facing pages. Also handles shop image slideshows
 * and Stripe checkout via the "Buy Now" button.
 */

const SiteContent = (() => {
    "use strict";

    let _data = null;

    // ── Fetch Data from API ─────────────────────────────────

    async function fetchAll() {
        const [contentRes, shopRes, portfolioRes] = await Promise.all([
            fetch("/api/content"),
            fetch("/api/shop"),
            fetch("/api/portfolio")
        ]);
        const content        = await contentRes.json();
        const shopItems      = await shopRes.json();
        const portfolioItems = await portfolioRes.json();

        _data = { ...content, shopItems, portfolioItems };
        return _data;
    }

    function load() {
        return _data || {};
    }

    // ── Helpers ─────────────────────────────────────────────

    function formatPrice(cents) {
        return "$" + (cents / 100).toFixed(2);
    }

    /** Normalise image sources: API returns objects; legacy strings still work. */
    function getImageSrcList(images) {
        if (!images) return [];
        return images.map(img => (typeof img === "string" ? img : img.image_path));
    }

    // ── Page Renderers ──────────────────────────────────────

    function renderIndex() {
        const data = load();

        const title = document.querySelector(".site-title");
        if (title) title.textContent = data.siteTitle || "Ariana's Art Site";

        const welcome = document.querySelector(".welcome-text");
        if (welcome) welcome.textContent = data.welcomeText || "";

        // Preview = first 2 items (API returns newest-first)
        const container = document.querySelector(".preview-items");
        if (!container) return;
        container.innerHTML = "";

        const items  = data.shopItems || [];
        const newest = items.slice(0, 2);

        newest.forEach(item => {
            const card = document.createElement("div");
            card.className = "preview-card";

            const srcs = getImageSrcList(item.images);
            card.innerHTML = `
                ${_slideshowHTML(srcs, item.name)}
                <div class="preview-info">${formatPrice(item.price_cents)} — ${_esc(item.name)}</div>`;
            container.appendChild(card);
        });

        _initSlideshows(container);
    }

    function renderAbout() {
        const data = load();

        const title = document.querySelector(".page-title");
        if (title) title.textContent = data.aboutTitle || "About the Artist";

        const name = document.querySelector(".about-text h2");
        if (name) name.textContent = data.aboutName || "";

        const paras = document.querySelectorAll(".about-text p");
        if (paras[0]) paras[0].textContent = data.aboutBio1 || "";
        if (paras[1]) paras[1].textContent = data.aboutBio2 || "";

        const img = document.querySelector(".about-photo img");
        if (img && data.aboutImage) {
            img.src     = data.aboutImage;
            img.onerror = () => (img.style.display = "none");
        }
    }

    function renderPortfolio() {
        const data      = load();
        const container = document.querySelector(".gallery");
        if (!container) return;
        container.innerHTML = "";

        const items = data.portfolioItems || [];
        items.forEach(item => {
            const div = document.createElement("div");
            div.className = "gallery-item";

            const srcs = getImageSrcList(item.images);
            div.innerHTML = `
                ${_slideshowHTML(srcs, item.title)}
                <p class="gallery-caption">${_esc(item.title)}</p>`;
            container.appendChild(div);
        });

        _initSlideshows(container);
    }

    function renderShop() {
        const data      = load();
        const container = document.getElementById("shop-items");
        if (!container) return;
        container.innerHTML = "";

        const items = data.shopItems || [];
        items.forEach(item => {
            const row = document.createElement("div");
            row.className = "shop-item";

            const srcs = getImageSrcList(item.images);
            row.innerHTML = `
                ${_slideshowHTML(srcs, item.name)}
                <div class="shop-info-bar">
                    <span>${formatPrice(item.price_cents)} — ${_esc(item.name)}</span>
                    <button class="buy-btn" data-item-id="${item.id}">Buy Now</button>
                </div>`;

            container.appendChild(row);
        });

        _initSlideshows(container);
        _initBuyButtons(container);
    }

    // ── Buy-Button Handler ──────────────────────────────────

    function _initBuyButtons(root) {
        root.querySelectorAll(".buy-btn").forEach(btn => {
            btn.addEventListener("click", async () => {
                btn.disabled    = true;
                btn.textContent = "Redirecting\u2026";
                try {
                    const res = await fetch("/api/checkout", {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify({ itemId: parseInt(btn.dataset.itemId, 10) })
                    });
                    const result = await res.json();
                    if (result.url) {
                        window.location.href = result.url;
                    } else {
                        alert(result.error || "Checkout failed.");
                        btn.disabled    = false;
                        btn.textContent = "Buy Now";
                    }
                } catch (_) {
                    alert("Checkout failed. Please try again.");
                    btn.disabled    = false;
                    btn.textContent = "Buy Now";
                }
            });
        });
    }

    // ── Slideshow HTML Builder ──────────────────────────────

    function _slideshowHTML(srcs, altText) {
        if (srcs.length === 0) {
            return `<div class="slideshow"><div class="slide-placeholder"></div></div>`;
        }

        const hasMultiple = srcs.length > 1;
        const slides = srcs.map((src, i) =>
            `<img class="slide ${i === 0 ? "slide-active" : ""}"
                  src="${src}" alt="${_esc(altText)} image ${i + 1}"
                  onerror="this.style.display='none'">`
        ).join("");

        return `
            <div class="slideshow" data-index="0">
                ${slides}
                ${hasMultiple ? `
                    <button class="slide-arrow slide-prev" data-dir="-1">&#10094;</button>
                    <button class="slide-arrow slide-next" data-dir="1">&#10095;</button>
                    <div class="slide-dots">
                        ${srcs.map((_, i) =>
                            `<span class="dot ${i === 0 ? "dot-active" : ""}" data-slide="${i}"></span>`
                        ).join("")}
                    </div>
                ` : ""}
            </div>`;
    }

    // ── Slideshow Logic ─────────────────────────────────────

    function _initSlideshows(root) {
        root.querySelectorAll(".slideshow").forEach(ss => {
            const slides = ss.querySelectorAll(".slide");
            if (slides.length <= 1) return;

            ss.querySelectorAll(".slide-arrow").forEach(btn => {
                btn.addEventListener("click", () => {
                    _navigate(ss, parseInt(btn.dataset.dir, 10));
                });
            });

            ss.querySelectorAll(".dot").forEach(dot => {
                dot.addEventListener("click", () => {
                    _goToSlide(ss, parseInt(dot.dataset.slide, 10));
                });
            });
        });
    }

    function _navigate(ss, dir) {
        const slides = ss.querySelectorAll(".slide");
        let current = parseInt(ss.dataset.index, 10) || 0;
        current = (current + dir + slides.length) % slides.length;
        _goToSlide(ss, current);
    }

    function _goToSlide(ss, idx) {
        const slides = ss.querySelectorAll(".slide");
        const dots   = ss.querySelectorAll(".dot");
        slides.forEach((s, i) => s.classList.toggle("slide-active", i === idx));
        dots.forEach((d, i)   => d.classList.toggle("dot-active",  i === idx));
        ss.dataset.index = idx;
    }

    // ── Utility ─────────────────────────────────────────────
    function _esc(str) {
        if (!str) return "";
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    // ── Auto-init based on page ─────────────────────────────
    async function init() {
        try {
            await fetchAll();
        } catch (e) {
            console.error("Failed to load site data:", e);
            return;
        }

        const path = location.pathname.toLowerCase();
        if (path.endsWith("index.html") || path.endsWith("/") || path === "") {
            renderIndex();
        } else if (path.includes("about")) {
            renderAbout();
        } else if (path.includes("portfolio")) {
            renderPortfolio();
        } else if (path.includes("shop")) {
            renderShop();
        }
    }

    document.addEventListener("DOMContentLoaded", init);

    return { init };
})();
