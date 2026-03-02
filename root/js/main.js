/**
 * main.js — Dynamic Content Loader & Slideshow
 *
 * Reads admin-managed content from localStorage and renders it
 * onto the public-facing pages. Also handles shop image slideshows.
 */

const SiteContent = (() => {
    "use strict";

    const STORAGE_KEY = "artsite_content";
    const IMG_STORAGE  = "artsite_images";

    // ── Defaults (mirror admin.js) ──────────────────────────
    const DEFAULTS = {
        siteTitle: "Ariana's Art Site",
        welcomeText:
            "Welcome! Explore original artwork by Ariana. Browse the portfolio to see the full collection, or check out the shop to bring a piece home.",
        aboutTitle: "About the Artist",
        aboutName: "Ariana",
        aboutBio1:
            "Welcome to my art site! I'm a passionate artist who loves creating pieces that capture emotion and tell stories. Browse my portfolio to see my work, or visit the shop to purchase original pieces.",
        aboutBio2:
            "Feel free to reach out if you have any questions or would like to commission a custom piece.",
        aboutImage: "",
        shopItems: [
            { name: "Art Piece 1", price: "$50", images: [] },
            { name: "Art Piece 2", price: "$75", images: [] }
        ],
        portfolioItems: [
            { title: "Piece Title", image: "" },
            { title: "Piece Title", image: "" },
            { title: "Piece Title", image: "" },
            { title: "Piece Title", image: "" },
            { title: "Piece Title", image: "" },
            { title: "Piece Title", image: "" }
        ]
    };

    function load() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
        try {
            return JSON.parse(raw);
        } catch { return JSON.parse(JSON.stringify(DEFAULTS)); }
    }

    function getImage(key) {
        const store = JSON.parse(localStorage.getItem(IMG_STORAGE) || "{}");
        return store[key] || "";
    }

    // Figure out the img/ prefix based on page depth
    function imgPrefix() {
        return location.pathname.includes("/pages/") ? "../img/" : "img/";
    }

    // Resolve an image src — either a data-URL from uploads or a filename fallback
    function resolveImg(dataUrl, fallbackFilename) {
        if (dataUrl && dataUrl.startsWith("data:")) return dataUrl;
        if (fallbackFilename) return imgPrefix() + fallbackFilename;
        return "";
    }

    // ── Page Renderers ──────────────────────────────────────

    function renderIndex() {
        const data = load();

        const title = document.querySelector(".site-title");
        if (title) title.textContent = data.siteTitle || DEFAULTS.siteTitle;

        const welcome = document.querySelector(".welcome-text");
        if (welcome) welcome.textContent = data.welcomeText || DEFAULTS.welcomeText;

        // Preview = last 2 shop items
        const container = document.querySelector(".preview-items");
        if (!container) return;
        container.innerHTML = "";

        const items = data.shopItems || DEFAULTS.shopItems;
        const newest = items.slice(-2);

        newest.forEach(item => {
            const card = document.createElement("div");
            card.className = "preview-card";

            const firstImg = (item.images && item.images.length > 0) ? item.images[0] : "";
            const src = resolveImg(firstImg, "");

            card.innerHTML = `
                <img src="${src}" alt="${_esc(item.name)}"
                     onerror="this.style.display='none'">
                <div class="preview-info">${_esc(item.price)} — ${_esc(item.name)}</div>`;
            container.appendChild(card);
        });
    }

    function renderAbout() {
        const data = load();

        const title = document.querySelector(".page-title");
        if (title) title.textContent = data.aboutTitle || DEFAULTS.aboutTitle;

        const name = document.querySelector(".about-text h2");
        if (name) name.textContent = data.aboutName || DEFAULTS.aboutName;

        const paras = document.querySelectorAll(".about-text p");
        if (paras[0]) paras[0].textContent = data.aboutBio1 || DEFAULTS.aboutBio1;
        if (paras[1]) paras[1].textContent = data.aboutBio2 || DEFAULTS.aboutBio2;

        const img = document.querySelector(".about-photo img");
        if (img) {
            const src = resolveImg(data.aboutImage || getImage("about_photo"), "artist.jpg");
            if (src) { img.src = src; img.onerror = () => img.style.display = "none"; }
        }
    }

    function renderPortfolio() {
        const data = load();
        const container = document.querySelector(".gallery");
        if (!container) return;
        container.innerHTML = "";

        const items = data.portfolioItems || DEFAULTS.portfolioItems;
        items.forEach(item => {
            const div = document.createElement("div");
            div.className = "gallery-item";

            const src = resolveImg(item.image, "");
            div.innerHTML = `
                <img src="${src}" alt="${_esc(item.title)}"
                     onerror="this.style.display='none'">
                <p class="gallery-caption">${_esc(item.title)}</p>`;
            container.appendChild(div);
        });
    }

    function renderShop() {
        const data = load();
        const container = document.getElementById("shop-items");
        if (!container) return;
        container.innerHTML = "";

        const items = data.shopItems || DEFAULTS.shopItems;
        items.forEach((item, idx) => {
            const row = document.createElement("div");
            row.className = "shop-item";

            const images = (item.images && item.images.length > 0) ? item.images : [];
            const hasMultiple = images.length > 1;

            let slideshowHTML = "";
            if (images.length === 0) {
                slideshowHTML = `<div class="slideshow"><div class="slide-placeholder"></div></div>`;
            } else {
                const slides = images.map((src, i) =>
                    `<img class="slide ${i === 0 ? "slide-active" : ""}"
                          src="${src}" alt="${_esc(item.name)} image ${i + 1}"
                          onerror="this.style.display='none'">`
                ).join("");

                slideshowHTML = `
                    <div class="slideshow" data-index="0">
                        ${slides}
                        ${hasMultiple ? `
                            <button class="slide-arrow slide-prev" data-dir="-1">&#10094;</button>
                            <button class="slide-arrow slide-next" data-dir="1">&#10095;</button>
                            <div class="slide-dots">
                                ${images.map((_, i) =>
                                    `<span class="dot ${i === 0 ? "dot-active" : ""}" data-slide="${i}"></span>`
                                ).join("")}
                            </div>
                        ` : ""}
                    </div>`;
            }

            row.innerHTML = `
                ${slideshowHTML}
                <div class="shop-info-bar">
                    <span>${_esc(item.price)} — ${_esc(item.name)}</span>
                </div>`;

            container.appendChild(row);
        });

        // Attach slideshow listeners
        _initSlideshows(container);
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
    function init() {
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

    return { init, renderIndex, renderAbout, renderPortfolio, renderShop };
})();

// Run on DOM ready
document.addEventListener("DOMContentLoaded", SiteContent.init);
