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

    // ── Cart State (persisted in localStorage) ────────────────
    let _cart = [];
    let _cartDirty = false;

    function _loadCart() {
        try {
            const stored = localStorage.getItem("artsite_cart");
            _cart = stored ? JSON.parse(stored) : [];
        } catch (_) { _cart = []; }
    }

    function _saveCart() {
        localStorage.setItem("artsite_cart", JSON.stringify(_cart));
        _updateFloatingCart();
    }

    // ── Floating Cart Icon (visible on every page when cart has items) ──

    function _createFloatingCart() {
        // Don't show floating cart on the cart page itself
        if (location.pathname.toLowerCase().includes("cart")) return;

        // Determine correct path to cart.html based on current page
        const onPagesLevel = location.pathname.toLowerCase().includes("/pages/");
        const cartUrl = onPagesLevel ? "cart.html" : "pages/cart.html";

        const btn = document.createElement("a");
        btn.href = cartUrl;
        btn.className = "floating-cart-btn";
        btn.id = "floating-cart-btn";
        btn.setAttribute("aria-label", "View cart");
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zM7.17 14.75l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7.42c-.14 0-.25-.11-.25-.25z"/>
            </svg>
            <span class="floating-cart-badge" id="floating-cart-badge">0</span>`;
        document.body.appendChild(btn);
    }

    function _updateFloatingCart() {
        const btn   = document.getElementById("floating-cart-btn");
        const badge = document.getElementById("floating-cart-badge");
        if (!btn || !badge) return;

        const count = _cart.reduce((sum, ci) => sum + ci.quantity, 0);
        if (count > 0) {
            btn.style.display = "";
            badge.textContent = count;
        } else {
            btn.style.display = "none";
        }
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
        const newest = items.slice(-2).reverse();

        newest.forEach(item => {
            const card = document.createElement("div");
            card.className = "preview-card";

            const srcs = getImageSrcList(item.images);
            card.innerHTML = `
                ${_slideshowHTML(srcs, item.name)}
                <div class="preview-info">
                    <span>${formatPrice(item.price_cents)} — ${_esc(item.name)}</span>
                    <button class="add-cart-btn" data-item-id="${item.id}"
                            data-item-name="${_esc(item.name)}"
                            data-item-price="${item.price_cents}"
                            data-item-max="${item.quantity}"
                            data-item-type="${item.item_type || 'physical'}">Add to Cart</button>
                </div>`;
            container.appendChild(card);
        });

        _initSlideshows(container);
        _initAddToCartButtons(container);
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
                    <button class="add-cart-btn" data-item-id="${item.id}"
                            data-item-name="${_esc(item.name)}"
                            data-item-price="${item.price_cents}"
                            data-item-max="${item.quantity}"
                            data-item-type="${item.item_type || 'physical'}">Add to Cart</button>
                </div>`;

            container.appendChild(row);
        });

        _initSlideshows(container);
        _initAddToCartButtons(container);
    }

    // ── Add-to-Cart Handler ─────────────────────────────────

    function _initAddToCartButtons(root) {
        root.querySelectorAll(".add-cart-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const itemId     = parseInt(btn.dataset.itemId, 10);
                const name       = btn.dataset.itemName;
                const price_cents = parseInt(btn.dataset.itemPrice, 10);
                const maxQty     = parseInt(btn.dataset.itemMax, 10);
                const itemType   = btn.dataset.itemType || "physical";

                const existing = _cart.find(c => c.itemId === itemId);
                if (existing) {
                    if (existing.quantity < existing.maxQuantity) {
                        existing.quantity++;
                    } else {
                        alert(`Only ${existing.maxQuantity} of "${name}" available.`);
                        return;
                    }
                } else {
                    _cart.push({ itemId, name, price_cents, quantity: 1, maxQuantity: maxQty, itemType });
                }
                _saveCart();
            });
        });
    }

    // ── Cart Page Renderer (cart.html) ─────────────────────────

    function renderCartPage() {
        _renderCartItems();
        _initCartControls();
    }

    function _renderCartItems() {
        const container = document.getElementById("cart-items");
        const totalEl   = document.getElementById("cart-total");
        const warning   = document.getElementById("cart-warning");
        const emptyMsg  = document.getElementById("cart-empty-msg");
        const footer    = document.getElementById("cart-footer");
        if (!container) return;

        if (!_cart.length) {
            container.innerHTML = "";
            if (emptyMsg) emptyMsg.style.display = "";
            if (footer)   footer.style.display = "none";
            if (warning)  warning.style.display = "none";
            return;
        }
        if (emptyMsg) emptyMsg.style.display = "none";
        if (footer)   footer.style.display = "";

        container.innerHTML = "";
        let total = 0;

        _cart.forEach((ci, idx) => {
            const lineTotal = ci.price_cents * ci.quantity;
            total += lineTotal;

            const row = document.createElement("div");
            row.className = "cart-row";
            row.innerHTML = `
                <span class="cart-item-name">${_esc(ci.name)}</span>
                <div class="cart-qty-controls">
                    <button class="cart-qty-btn" data-idx="${idx}" data-dir="-1">−</button>
                    <span class="cart-qty-value">${ci.quantity}</span>
                    <button class="cart-qty-btn" data-idx="${idx}" data-dir="1">+</button>
                </div>
                <span class="cart-item-price">${formatPrice(lineTotal)}</span>
                <button class="cart-remove-btn" data-idx="${idx}">&times;</button>`;
            container.appendChild(row);
        });

        if (totalEl) totalEl.textContent = "Total: " + formatPrice(total);
        if (warning) warning.style.display = _cartDirty ? "" : "none";

        // Wire quantity buttons
        container.querySelectorAll(".cart-qty-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const dir = parseInt(btn.dataset.dir, 10);
                const ci  = _cart[idx];
                if (!ci) return;

                const newQty = ci.quantity + dir;
                if (newQty < 1) return;
                if (newQty > ci.maxQuantity) {
                    alert(`Only ${ci.maxQuantity} of "${ci.name}" available.`);
                    return;
                }
                ci.quantity = newQty;
                _cartDirty = true;
                _saveCart();
                _renderCartItems();
            });
        });

        // Wire remove buttons
        container.querySelectorAll(".cart-remove-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx, 10);
                _cart.splice(idx, 1);
                _saveCart();
                _renderCartItems();
            });
        });
    }

    // ── Cart Controls (Refresh & Checkout) ──────────────────

    function _initCartControls() {
        const refreshBtn  = document.getElementById("cart-refresh-btn");
        const checkoutBtn = document.getElementById("cart-checkout-btn");

        if (refreshBtn) {
            refreshBtn.addEventListener("click", async () => {
                refreshBtn.disabled    = true;
                refreshBtn.textContent = "Refreshing…";
                try {
                    const res   = await fetch("/api/shop");
                    const items = await res.json();

                    _cart = _cart.filter(ci => {
                        const fresh = items.find(i => i.id === ci.itemId);
                        if (!fresh || fresh.quantity <= 0) return false;
                        ci.maxQuantity = fresh.quantity;
                        ci.price_cents = fresh.price_cents;
                        ci.itemType    = fresh.item_type || "physical";
                        if (ci.quantity > ci.maxQuantity) ci.quantity = ci.maxQuantity;
                        return true;
                    });

                    _cartDirty = false;
                    _saveCart();
                    _renderCartItems();
                } catch (_) {
                    alert("Failed to refresh cart. Please try again.");
                }
                refreshBtn.disabled    = false;
                refreshBtn.textContent = "Refresh Cart";
            });
        }

        if (checkoutBtn) {
            checkoutBtn.addEventListener("click", () => {
                if (!_cart.length) return;
                if (_cartDirty) {
                    alert("Please press Refresh Cart first to confirm current prices and availability.");
                    return;
                }
                _showCheckoutForm();
            });
        }
    }

    // ── Checkout Info Form ──────────────────────────────────

    function _hasPhysicalItems() {
        return _cart.some(ci => (ci.itemType || "physical") === "physical");
    }

    function _showCheckoutForm() {
        // Remove if already showing
        const existing = document.getElementById("checkout-info-overlay");
        if (existing) existing.remove();

        const needsAddress = _hasPhysicalItems();

        const overlay = document.createElement("div");
        overlay.id = "checkout-info-overlay";
        overlay.className = "checkout-overlay";
        overlay.innerHTML = `
            <div class="checkout-form-card">
                <button class="checkout-form-close" id="checkout-form-close">&times;</button>
                <h2 class="checkout-form-title">${needsAddress ? "Shipping Information" : "Contact Information"}</h2>
                <form id="checkout-info-form">
                    <div class="checkout-form-field">
                        <label for="checkout-name">Full Name</label>
                        <input type="text" id="checkout-name" required placeholder="Your full name" maxlength="200">
                    </div>
                    <div class="checkout-form-field">
                        <label for="checkout-email">Email</label>
                        <input type="email" id="checkout-email" required placeholder="you@example.com" maxlength="320">
                    </div>
                    ${needsAddress ? `
                    <div class="checkout-form-field">
                        <label for="checkout-address">Address</label>
                        <input type="text" id="checkout-address" required placeholder="Street address" maxlength="500">
                    </div>
                    <div class="checkout-form-field">
                        <label for="checkout-address2">Apt / Suite / Unit (optional)</label>
                        <input type="text" id="checkout-address2" placeholder="Apt 4B" maxlength="100">
                    </div>
                    <div class="checkout-form-row">
                        <div class="checkout-form-field">
                            <label for="checkout-city">City</label>
                            <input type="text" id="checkout-city" required maxlength="200">
                        </div>
                        <div class="checkout-form-field">
                            <label for="checkout-state">State</label>
                            <input type="text" id="checkout-state" required maxlength="100">
                        </div>
                        <div class="checkout-form-field">
                            <label for="checkout-zip">ZIP Code</label>
                            <input type="text" id="checkout-zip" required maxlength="20">
                        </div>
                    </div>
                    <div class="checkout-form-field">
                        <label for="checkout-country">Country</label>
                        <input type="text" id="checkout-country" value="US" required maxlength="100">
                    </div>
                    ` : ""}
                    <button type="submit" class="checkout-form-submit">Proceed to Payment</button>
                </form>
            </div>`;
        document.body.appendChild(overlay);

        // Close button
        document.getElementById("checkout-form-close").addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

        // Form submit
        document.getElementById("checkout-info-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const customerName = document.getElementById("checkout-name").value.trim();
            const email = document.getElementById("checkout-email").value.trim();
            let shippingAddress = null;

            if (needsAddress) {
                const addr  = document.getElementById("checkout-address").value.trim();
                const addr2 = document.getElementById("checkout-address2").value.trim();
                const city  = document.getElementById("checkout-city").value.trim();
                const state = document.getElementById("checkout-state").value.trim();
                const zip   = document.getElementById("checkout-zip").value.trim();
                const country = document.getElementById("checkout-country").value.trim();
                shippingAddress = [addr, addr2, city, state, zip, country].filter(Boolean).join(", ");
            }

            const submitBtn = e.target.querySelector(".checkout-form-submit");
            submitBtn.disabled = true;
            submitBtn.textContent = "Redirecting\u2026";

            try {
                const payload = {
                    items: _cart.map(ci => ({ itemId: ci.itemId, quantity: ci.quantity })),
                    customerName,
                    email,
                    shippingAddress
                };
                const res = await fetch("/api/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (result.url) {
                    _cart = [];
                    _saveCart();
                    window.location.href = result.url;
                } else {
                    alert(result.error || "Checkout failed.");
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Proceed to Payment";
                }
            } catch (_) {
                alert("Checkout failed. Please try again.");
                submitBtn.disabled = false;
                submitBtn.textContent = "Proceed to Payment";
            }
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
        // Load cart from localStorage on every page
        _loadCart();
        _createFloatingCart();
        _updateFloatingCart();

        try {
            await fetchAll();
        } catch (e) {
            console.error("Failed to load site data:", e);
        }

        const p = location.pathname.toLowerCase();
        if (p.endsWith("index.html") || p.endsWith("/") || p === "") {
            renderIndex();
        } else if (p.includes("about")) {
            renderAbout();
        } else if (p.includes("portfolio")) {
            renderPortfolio();
        } else if (p.includes("cart")) {
            renderCartPage();
        } else if (p.includes("shop")) {
            renderShop();
        }
    }

    document.addEventListener("DOMContentLoaded", init);

    return { init };
})();
