/**
 * admin.js — Admin Panel Content Management
 *
 * Stores editable site content in localStorage.
 * Supports image uploads (base64 data-URLs) and multi-image shop listings.
 * All user input is sanitized before storage and rendering.
 */

const Admin = (() => {
    "use strict";

    const STORAGE_KEY = "artsite_content";

    // ── Default Content ─────────────────────────────────────
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
            { name: "Art Piece 1", price: "$50",  images: [] },
            { name: "Art Piece 2", price: "$75",  images: [] }
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

    // ── Storage Helpers ─────────────────────────────────────
    function load() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
        try {
            return JSON.parse(raw);
        } catch {
            return JSON.parse(JSON.stringify(DEFAULTS));
        }
    }

    function save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function resetToDefaults() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ── Sanitized Getters ───────────────────────────────────
    function get(key) {
        const data = load();
        const val = data[key] !== undefined ? data[key] : DEFAULTS[key];
        if (typeof val === "string") return Auth.sanitize(val);
        return val;
    }

    function getRaw(key) {
        const data = load();
        return data[key] !== undefined ? data[key] : DEFAULTS[key];
    }

    function set(key, value) {
        const data = load();
        if (typeof value === "string") {
            const check = Auth.validateInput(value);
            if (!check.valid) return { success: false, message: check.reason };
            data[key] = value;
        } else {
            data[key] = value;
        }
        save(data);
        return { success: true };
    }

    // ── Image Upload Helper ─────────────────────────────────
    function _readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith("image/")) {
                reject(new Error("Not an image file"));
                return;
            }
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function _createUploadBtn(labelText, onUpload) {
        const wrap = document.createElement("div");
        wrap.className = "admin-field admin-upload";

        const lbl = document.createElement("label");
        lbl.textContent = labelText;

        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.addEventListener("change", async () => {
            if (input.files && input.files[0]) {
                try {
                    const dataUrl = await _readFileAsDataURL(input.files[0]);
                    onUpload(dataUrl);
                } catch (e) {
                    alert("Could not read image: " + e.message);
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

    // ── Collect unsaved form values from DOM ────────────────
    function _collectFormValues(data) {
        const container = document.getElementById("admin-content");
        if (!container) return;

        // Text fields (siteTitle, welcomeText, etc.)
        container.querySelectorAll("input[data-key], textarea[data-key]").forEach(el => {
            const v = Auth.validateInput(el.value);
            if (v.valid) data[el.dataset.key] = el.value;
        });

        // Array item text fields (shop name/price, portfolio title)
        container.querySelectorAll("input[data-type]").forEach(el => {
            const arr =
                el.dataset.type === "shop" ? data.shopItems : data.portfolioItems;
            const idx = parseInt(el.dataset.index, 10);
            if (arr[idx]) {
                const v = Auth.validateInput(el.value);
                if (v.valid) arr[idx][el.dataset.prop] = el.value;
            }
        });
    }

    // ── Admin Dashboard Rendering ──────────────────────────
    function renderDashboard() {
        if (!Auth.isLoggedIn()) {
            window.location.href = "login.html";
            return;
        }

        const data = load();
        const container = document.getElementById("admin-content");
        if (!container) return;
        container.innerHTML = "";

        // ── Text Content Section ────
        const textSection = _section("Text Content");
        textSection.appendChild(_field("Site Title", "siteTitle", data.siteTitle));
        textSection.appendChild(_textarea("Welcome Text", "welcomeText", data.welcomeText));
        textSection.appendChild(_field("About Page Title", "aboutTitle", data.aboutTitle));
        textSection.appendChild(_field("Artist Name", "aboutName", data.aboutName));
        textSection.appendChild(_textarea("About Bio Paragraph 1", "aboutBio1", data.aboutBio1));
        textSection.appendChild(_textarea("About Bio Paragraph 2", "aboutBio2", data.aboutBio2));

        // About photo upload
        const aboutPhotoWrap = document.createElement("div");
        aboutPhotoWrap.className = "admin-field";
        if (data.aboutImage) aboutPhotoWrap.appendChild(_imagePreview(data.aboutImage));
        aboutPhotoWrap.appendChild(_createUploadBtn("About Page Photo", (url) => {
            _collectFormValues(data);
            data.aboutImage = url;
            save(data);
            renderDashboard();
        }));
        textSection.appendChild(aboutPhotoWrap);

        container.appendChild(textSection);

        // ── Shop Items Section ──────
        const shopSection = _section("Shop Items");
        (data.shopItems || []).forEach((item, i) => {
            shopSection.appendChild(_shopItemEditor(data, i, item));
        });
        const addShopBtn = document.createElement("button");
        addShopBtn.className = "admin-btn admin-btn-add";
        addShopBtn.textContent = "+ Add Shop Item";
        addShopBtn.addEventListener("click", () => {
            _collectFormValues(data);
            data.shopItems.push({ name: "New Item", price: "$0", images: [] });
            save(data);
            renderDashboard();
        });
        shopSection.appendChild(addShopBtn);
        container.appendChild(shopSection);

        // ── Portfolio Items Section ─
        const portSection = _section("Portfolio Items");
        (data.portfolioItems || []).forEach((item, i) => {
            portSection.appendChild(_portfolioItemEditor(data, i, item));
        });
        const addPortBtn = document.createElement("button");
        addPortBtn.className = "admin-btn admin-btn-add";
        addPortBtn.textContent = "+ Add Portfolio Item";
        addPortBtn.addEventListener("click", () => {
            _collectFormValues(data);
            data.portfolioItems.push({ title: "New Piece", image: "" });
            save(data);
            renderDashboard();
        });
        portSection.appendChild(addPortBtn);
        container.appendChild(portSection);

        // ── Save / Reset ────────────
        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const saveBtn = document.createElement("button");
        saveBtn.className = "admin-btn admin-btn-save";
        saveBtn.textContent = "Save All Changes";
        saveBtn.addEventListener("click", () => _saveAll(container, data));

        const resetBtn = document.createElement("button");
        resetBtn.className = "admin-btn admin-btn-reset";
        resetBtn.textContent = "Reset to Defaults";
        resetBtn.addEventListener("click", () => {
            if (confirm("Reset all content to defaults? This cannot be undone.")) {
                resetToDefaults();
                renderDashboard();
            }
        });

        actions.appendChild(saveBtn);
        actions.appendChild(resetBtn);
        container.appendChild(actions);
    }

    // ── Private DOM Helpers ─────────────────────────────────

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
        inp.type = "text";
        inp.dataset.key = key;
        inp.value = value || "";
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
        ta.rows = 3;
        ta.value = value || "";
        wrap.appendChild(lbl);
        wrap.appendChild(ta);
        return wrap;
    }

    // ── Shop Item Editor (multi-image) ──────────────────────

    function _shopItemEditor(data, index, item) {
        const wrap = document.createElement("div");
        wrap.className = "admin-item admin-item-vertical";

        // Text fields row
        const fields = document.createElement("div");
        fields.className = "admin-item-fields";
        fields.innerHTML = `
            <div class="admin-field">
                <label>Name</label>
                <input type="text" data-type="shop" data-index="${index}" data-prop="name"
                       value="${Auth.sanitize(item.name || "")}">
            </div>
            <div class="admin-field">
                <label>Price</label>
                <input type="text" data-type="shop" data-index="${index}" data-prop="price"
                       value="${Auth.sanitize(item.price || "")}">
            </div>`;
        wrap.appendChild(fields);

        // Image gallery
        const gallery = document.createElement("div");
        gallery.className = "admin-image-gallery";
        const galLabel = document.createElement("label");
        galLabel.textContent = "Images (" + (item.images ? item.images.length : 0) + ")";
        gallery.appendChild(galLabel);

        const thumbs = document.createElement("div");
        thumbs.className = "admin-thumbs";
        if (item.images && item.images.length > 0) {
            item.images.forEach((src, imgIdx) => {
                const thumbWrap = document.createElement("div");
                thumbWrap.className = "admin-thumb-wrap";
                const thumb = document.createElement("img");
                thumb.className = "admin-img-preview";
                thumb.src = src;
                thumb.alt = "Image " + (imgIdx + 1);
                const removeBtn = document.createElement("button");
                removeBtn.className = "admin-btn admin-btn-thumb-remove";
                removeBtn.textContent = "\u00D7";
                removeBtn.title = "Remove image";
                removeBtn.addEventListener("click", () => {
                    _collectFormValues(data);
                    data.shopItems[index].images.splice(imgIdx, 1);
                    save(data);
                    renderDashboard();
                });
                thumbWrap.appendChild(thumb);
                thumbWrap.appendChild(removeBtn);
                thumbs.appendChild(thumbWrap);
            });
        }
        gallery.appendChild(thumbs);

        // Upload button for adding images
        const uploadBtn = _createUploadBtn("Add Image", (url) => {
            _collectFormValues(data);
            if (!data.shopItems[index].images) data.shopItems[index].images = [];
            data.shopItems[index].images.push(url);
            save(data);
            renderDashboard();
        });
        gallery.appendChild(uploadBtn);
        wrap.appendChild(gallery);

        // Delete item button
        const delBtn = document.createElement("button");
        delBtn.className = "admin-btn admin-btn-delete";
        delBtn.textContent = "Remove Item";
        delBtn.addEventListener("click", () => {
            _collectFormValues(data);
            data.shopItems.splice(index, 1);
            save(data);
            renderDashboard();
        });
        wrap.appendChild(delBtn);

        return wrap;
    }

    // ── Portfolio Item Editor (single image upload) ─────────

    function _portfolioItemEditor(data, index, item) {
        const wrap = document.createElement("div");
        wrap.className = "admin-item";

        // Title field
        const titleField = document.createElement("div");
        titleField.className = "admin-field";
        titleField.innerHTML = `
            <label>Title</label>
            <input type="text" data-type="portfolio" data-index="${index}" data-prop="title"
                   value="${Auth.sanitize(item.title || "")}">`;
        wrap.appendChild(titleField);

        // Current image preview
        if (item.image) {
            wrap.appendChild(_imagePreview(item.image));
        }

        // Upload button
        wrap.appendChild(_createUploadBtn("Upload Image", (url) => {
            _collectFormValues(data);
            data.portfolioItems[index].image = url;
            save(data);
            renderDashboard();
        }));

        // Delete button
        const delBtn = document.createElement("button");
        delBtn.className = "admin-btn admin-btn-delete";
        delBtn.textContent = "Remove";
        delBtn.addEventListener("click", () => {
            _collectFormValues(data);
            data.portfolioItems.splice(index, 1);
            save(data);
            renderDashboard();
        });
        wrap.appendChild(delBtn);

        return wrap;
    }

    // ── Save All ────────────────────────────────────────────

    function _saveAll(container, data) {
        _collectFormValues(data);

        save(data);

        const msg = document.createElement("div");
        msg.className = "admin-toast";
        msg.textContent = "Changes saved!";
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2500);
    }

    // ── Public API ──────────────────────────────────────────
    return {
        load,
        save,
        get,
        getRaw,
        set,
        resetToDefaults,
        renderDashboard,
        DEFAULTS
    };
})();
