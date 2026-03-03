/**
 * admin.js — Admin Panel Content Management
 *
 * Manages site content through the server REST API.
 * Supports image uploads (stored as files on disk) and
 * multi-image shop / portfolio listings.
 */

const Admin = (() => {
    "use strict";

    // ── API Helpers ─────────────────────────────────────────

    async function apiFetch(url, options = {}) {
        const isForm = options.body instanceof FormData;
        const res = await fetch(url, {
            ...options,
            headers: {
                ...(isForm ? {} : { "Content-Type": "application/json" }),
                ...options.headers
            },
            body: isForm
                ? options.body
                : options.body
                    ? JSON.stringify(options.body)
                    : undefined
        });

        if (res.status === 401) {
            sessionStorage.removeItem("admin_logged_in");
            window.location.href = "login.html";
            throw new Error("Unauthorized");
        }

        return res.json();
    }

    async function fetchAllData() {
        const [content, shopItems, portfolioItems] = await Promise.all([
            apiFetch("/api/content"),
            apiFetch("/api/shop"),
            apiFetch("/api/portfolio")
        ]);
        return { ...content, shopItems, portfolioItems };
    }

    // ── Price Helpers ───────────────────────────────────────

    function centsToDisplay(cents) {
        return (cents / 100).toFixed(2);
    }

    function displayToCents(str) {
        const cleaned = String(str).replace(/[^0-9.]/g, "");
        return Math.round(parseFloat(cleaned) * 100) || 0;
    }

    // ── Image Upload Button ─────────────────────────────────

    function _createUploadBtn(labelText, uploadUrl) {
        const wrap = document.createElement("div");
        wrap.className = "admin-field admin-upload";

        const lbl = document.createElement("label");
        lbl.textContent = labelText;

        const input = document.createElement("input");
        input.type   = "file";
        input.accept = "image/*";
        input.addEventListener("change", async () => {
            if (input.files && input.files[0]) {
                try {
                    const fd = new FormData();
                    fd.append("image", input.files[0]);
                    await fetch(uploadUrl, { method: "POST", body: fd });
                    renderDashboard(); // refresh
                } catch (e) {
                    alert("Could not upload image: " + e.message);
                }
            }
        });

        wrap.appendChild(lbl);
        wrap.appendChild(input);
        return wrap;
    }

    function _imagePreview(src) {
        const img = document.createElement("img");
        img.className = "admin-img-preview";
        img.src = src;
        img.alt = "Preview";
        return img;
    }

    // ── Collect form values from the DOM ────────────────────

    function _collectContentFields(container) {
        const content = {};
        container.querySelectorAll("input[data-key], textarea[data-key]").forEach(el => {
            content[el.dataset.key] = el.value;
        });
        return content;
    }

    function _collectShopFields(container) {
        const items = {};
        container.querySelectorAll("input[data-type='shop']").forEach(el => {
            const id = el.dataset.id;
            if (!items[id]) items[id] = {};
            if (el.dataset.prop === "price") {
                items[id].price_cents = displayToCents(el.value);
            } else {
                items[id][el.dataset.prop] = el.value;
            }
        });
        return items;
    }

    function _collectPortfolioFields(container) {
        const items = {};
        container.querySelectorAll("input[data-type='portfolio']").forEach(el => {
            const id = el.dataset.id;
            if (!items[id]) items[id] = {};
            items[id][el.dataset.prop] = el.value;
        });
        return items;
    }

    // ── Dashboard Renderer ──────────────────────────────────

    async function renderDashboard() {
        if (!Auth.isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        let data;
        try {
            data = await fetchAllData();
        } catch (e) {
            if (e.message === "Unauthorized") return;
            console.error("Failed to load data:", e);
            return;
        }

        const container = document.getElementById("admin-content");
        if (!container) return;
        container.innerHTML = "";

        // ── Text Content ────────────────────────────────────
        const textSection = _section("Text Content");
        textSection.appendChild(_field("Site Title",            "siteTitle",   data.siteTitle   || ""));
        textSection.appendChild(_textarea("Welcome Text",       "welcomeText", data.welcomeText || ""));
        textSection.appendChild(_field("About Page Title",      "aboutTitle",  data.aboutTitle  || ""));
        textSection.appendChild(_field("Artist Name",           "aboutName",   data.aboutName   || ""));
        textSection.appendChild(_textarea("About Bio Paragraph 1", "aboutBio1", data.aboutBio1 || ""));
        textSection.appendChild(_textarea("About Bio Paragraph 2", "aboutBio2", data.aboutBio2 || ""));

        // About photo
        const aboutPhotoWrap = document.createElement("div");
        aboutPhotoWrap.className = "admin-field";
        if (data.aboutImage) aboutPhotoWrap.appendChild(_imagePreview(data.aboutImage));
        aboutPhotoWrap.appendChild(
            _createUploadBtn("About Page Photo", "/api/content/about-image")
        );
        textSection.appendChild(aboutPhotoWrap);

        container.appendChild(textSection);

        // ── Shop Items ──────────────────────────────────────
        const shopSection = _section("Shop Items");
        (data.shopItems || []).forEach(item => {
            shopSection.appendChild(_shopItemEditor(item));
        });

        const addShopBtn = document.createElement("button");
        addShopBtn.className   = "admin-btn admin-btn-add";
        addShopBtn.textContent = "+ Add Shop Item";
        addShopBtn.addEventListener("click", async () => {
            await apiFetch("/api/shop", {
                method: "POST",
                body:   { name: "New Item", price_cents: 0 }
            });
            renderDashboard();
        });
        shopSection.appendChild(addShopBtn);
        container.appendChild(shopSection);

        // ── Portfolio Items ─────────────────────────────────
        const portSection = _section("Portfolio Items");
        (data.portfolioItems || []).forEach(item => {
            portSection.appendChild(_portfolioItemEditor(item));
        });

        const addPortBtn = document.createElement("button");
        addPortBtn.className   = "admin-btn admin-btn-add";
        addPortBtn.textContent = "+ Add Portfolio Item";
        addPortBtn.addEventListener("click", async () => {
            await apiFetch("/api/portfolio", {
                method: "POST",
                body:   { title: "New Piece" }
            });
            renderDashboard();
        });
        portSection.appendChild(addPortBtn);
        container.appendChild(portSection);

        // ── Actions ─────────────────────────────────────────
        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const saveBtn = document.createElement("button");
        saveBtn.className   = "admin-btn admin-btn-save";
        saveBtn.textContent = "Save All Changes";
        saveBtn.addEventListener("click", () => _saveAll(container));

        actions.appendChild(saveBtn);
        container.appendChild(actions);
    }

    // ── DOM Helpers ─────────────────────────────────────────

    function _section(title) {
        const sec = document.createElement("div");
        sec.className = "admin-section";
        const h = document.createElement("h2");
        h.textContent = title;
        sec.appendChild(h);
        return sec;
    }

    function _field(label, key, value) {
        const wrap = document.createElement("div");
        wrap.className = "admin-field";
        const lbl = document.createElement("label");
        lbl.textContent = label;
        const inp = document.createElement("input");
        inp.type        = "text";
        inp.dataset.key = key;
        inp.value       = value || "";
        wrap.appendChild(lbl);
        wrap.appendChild(inp);
        return wrap;
    }

    function _textarea(label, key, value) {
        const wrap = document.createElement("div");
        wrap.className = "admin-field";
        const lbl = document.createElement("label");
        lbl.textContent = label;
        const ta = document.createElement("textarea");
        ta.dataset.key = key;
        ta.rows        = 3;
        ta.value       = value || "";
        wrap.appendChild(lbl);
        wrap.appendChild(ta);
        return wrap;
    }

    // ── Shop Item Editor ────────────────────────────────────

    function _shopItemEditor(item) {
        const wrap = document.createElement("div");
        wrap.className = "admin-item admin-item-vertical";

        // Text fields
        const fields = document.createElement("div");
        fields.className = "admin-item-fields";
        fields.innerHTML = `
            <div class="admin-field">
                <label>Name</label>
                <input type="text" data-type="shop" data-id="${item.id}" data-prop="name"
                       value="${Auth.sanitize(item.name || "")}">
            </div>
            <div class="admin-field">
                <label>Price ($)</label>
                <input type="text" data-type="shop" data-id="${item.id}" data-prop="price"
                       value="${centsToDisplay(item.price_cents || 0)}">
            </div>`;
        wrap.appendChild(fields);

        // Image gallery
        const gallery = document.createElement("div");
        gallery.className = "admin-image-gallery";
        const images = item.images || [];
        const galLabel = document.createElement("label");
        galLabel.textContent = "Images (" + images.length + ")";
        gallery.appendChild(galLabel);

        const thumbs = document.createElement("div");
        thumbs.className = "admin-thumbs";
        images.forEach(img => {
            const thumbWrap = document.createElement("div");
            thumbWrap.className = "admin-thumb-wrap";
            const thumb = document.createElement("img");
            thumb.className = "admin-img-preview";
            thumb.src = img.image_path;
            thumb.alt = "Image";
            const removeBtn = document.createElement("button");
            removeBtn.className   = "admin-btn admin-btn-thumb-remove";
            removeBtn.textContent = "\u00D7";
            removeBtn.title       = "Remove image";
            removeBtn.addEventListener("click", async () => {
                await apiFetch(`/api/shop/images/${img.id}`, { method: "DELETE" });
                renderDashboard();
            });
            thumbWrap.appendChild(thumb);
            thumbWrap.appendChild(removeBtn);
            thumbs.appendChild(thumbWrap);
        });
        gallery.appendChild(thumbs);

        gallery.appendChild(
            _createUploadBtn("Add Image", `/api/shop/${item.id}/images`)
        );
        wrap.appendChild(gallery);

        // Delete item
        const delBtn = document.createElement("button");
        delBtn.className   = "admin-btn admin-btn-delete";
        delBtn.textContent = "Remove Item";
        delBtn.addEventListener("click", async () => {
            await apiFetch(`/api/shop/${item.id}`, { method: "DELETE" });
            renderDashboard();
        });
        wrap.appendChild(delBtn);

        return wrap;
    }

    // ── Portfolio Item Editor ───────────────────────────────

    function _portfolioItemEditor(item) {
        const wrap = document.createElement("div");
        wrap.className = "admin-item admin-item-vertical";

        const fields = document.createElement("div");
        fields.className = "admin-item-fields";
        fields.innerHTML = `
            <div class="admin-field">
                <label>Title</label>
                <input type="text" data-type="portfolio" data-id="${item.id}" data-prop="title"
                       value="${Auth.sanitize(item.title || "")}">
            </div>`;
        wrap.appendChild(fields);

        // Image gallery
        const gallery = document.createElement("div");
        gallery.className = "admin-image-gallery";
        const images = item.images || [];
        const galLabel = document.createElement("label");
        galLabel.textContent = "Images (" + images.length + ")";
        gallery.appendChild(galLabel);

        const thumbs = document.createElement("div");
        thumbs.className = "admin-thumbs";
        images.forEach(img => {
            const thumbWrap = document.createElement("div");
            thumbWrap.className = "admin-thumb-wrap";
            const thumb = document.createElement("img");
            thumb.className = "admin-img-preview";
            thumb.src = img.image_path;
            thumb.alt = "Image";
            const removeBtn = document.createElement("button");
            removeBtn.className   = "admin-btn admin-btn-thumb-remove";
            removeBtn.textContent = "\u00D7";
            removeBtn.title       = "Remove image";
            removeBtn.addEventListener("click", async () => {
                await apiFetch(`/api/portfolio/images/${img.id}`, { method: "DELETE" });
                renderDashboard();
            });
            thumbWrap.appendChild(thumb);
            thumbWrap.appendChild(removeBtn);
            thumbs.appendChild(thumbWrap);
        });
        gallery.appendChild(thumbs);

        gallery.appendChild(
            _createUploadBtn("Add Image", `/api/portfolio/${item.id}/images`)
        );
        wrap.appendChild(gallery);

        // Delete item
        const delBtn = document.createElement("button");
        delBtn.className   = "admin-btn admin-btn-delete";
        delBtn.textContent = "Remove Item";
        delBtn.addEventListener("click", async () => {
            await apiFetch(`/api/portfolio/${item.id}`, { method: "DELETE" });
            renderDashboard();
        });
        wrap.appendChild(delBtn);

        return wrap;
    }

    // ── Save All ────────────────────────────────────────────

    async function _saveAll(container) {
        try {
            // 1. Text content
            const content = _collectContentFields(container);
            await apiFetch("/api/content", { method: "PUT", body: content });

            // 2. Shop items (name / price)
            const shopFields = _collectShopFields(container);
            for (const [id, fields] of Object.entries(shopFields)) {
                await apiFetch(`/api/shop/${id}`, { method: "PUT", body: fields });
            }

            // 3. Portfolio items (title)
            const portfolioFields = _collectPortfolioFields(container);
            for (const [id, fields] of Object.entries(portfolioFields)) {
                await apiFetch(`/api/portfolio/${id}`, { method: "PUT", body: fields });
            }

            // Toast
            const msg = document.createElement("div");
            msg.className   = "admin-toast";
            msg.textContent = "Changes saved!";
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 2500);
        } catch (e) {
            if (e.message !== "Unauthorized") {
                alert("Error saving changes: " + e.message);
            }
        }
    }

    // ── Public API ──────────────────────────────────────────
    return { renderDashboard };
})();
