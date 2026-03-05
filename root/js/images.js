/**
 * images.js — Image Manager
 *
 * Displays all uploaded images from the server,
 * with preview, download, and delete functionality.
 */

const ImageManager = (() => {
    "use strict";

    let _pendingDelete = null; // { source, id, row }

    // ── API Helpers ────────────────────────────────────────

    async function apiFetch(url, options = {}) {
        const res = await fetch(url, {
            ...options,
            headers: { "Content-Type": "application/json", ...options.headers }
        });
        if (res.status === 401) {
            sessionStorage.removeItem("admin_logged_in");
            window.location.href = "login.html";
            throw new Error("Unauthorized");
        }
        return res.json();
    }

    // ── Initialization ─────────────────────────────────────

    async function init() {
        setupModals();
        await loadImages();
    }

    async function loadImages() {
        const container = document.getElementById("images-list");
        container.innerHTML = '<p class="images-loading">Loading images&hellip;</p>';

        let images;
        try {
            images = await apiFetch("/api/images");
        } catch (e) {
            if (e.message === "Unauthorized") return;
            container.innerHTML = '<p class="images-empty">Failed to load images.</p>';
            return;
        }

        if (!images.length) {
            container.innerHTML = '<p class="images-empty">No uploaded images found.</p>';
            return;
        }

        container.innerHTML = "";
        const table = document.createElement("table");
        table.className = "images-table";

        // Header
        const thead = document.createElement("thead");
        thead.innerHTML = `
            <tr>
                <th></th>
                <th>File Name</th>
                <th>Source</th>
                <th>Parent</th>
                <th>Actions</th>
            </tr>`;
        table.appendChild(thead);

        // Body
        const tbody = document.createElement("tbody");
        images.forEach(img => {
            const row = document.createElement("tr");
            const fileName = img.image_path.split("/").pop();

            row.innerHTML = `
                <td><img class="img-thumb" src="${esc(img.image_path)}" alt="${esc(fileName)}"></td>
                <td class="img-name-cell">${esc(fileName)}</td>
                <td><span class="img-source-badge ${esc(img.source)}">${esc(img.source)}</span></td>
                <td>${esc(img.parent_name || "—")}</td>
                <td class="img-actions"></td>`;

            const actionsCell = row.querySelector(".img-actions");

            // Preview button
            const previewBtn = document.createElement("button");
            previewBtn.className = "admin-btn admin-btn-preview";
            previewBtn.textContent = "Preview";
            previewBtn.addEventListener("click", () => openPreview(img.image_path));

            // Download button
            const downloadBtn = document.createElement("button");
            downloadBtn.className = "admin-btn admin-btn-download";
            downloadBtn.textContent = "Download";
            downloadBtn.addEventListener("click", () => downloadImage(img.image_path, fileName));

            // Delete button
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "admin-btn admin-btn-delete";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => {
                _pendingDelete = {
                    source: img.source,
                    id: img.id,
                    row: row
                };
                document.getElementById("delete-modal").classList.remove("hidden");
            });

            actionsCell.appendChild(previewBtn);
            actionsCell.appendChild(downloadBtn);
            actionsCell.appendChild(deleteBtn);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        container.appendChild(table);
    }

    // ── Preview Modal ──────────────────────────────────────

    function openPreview(src) {
        const modal = document.getElementById("preview-modal");
        const img   = document.getElementById("preview-img");
        img.src = src;
        modal.classList.remove("hidden");
    }

    function closePreview() {
        const modal = document.getElementById("preview-modal");
        modal.classList.add("hidden");
        document.getElementById("preview-img").src = "";
    }

    // ── Download ───────────────────────────────────────────

    function downloadImage(src, fileName) {
        const a = document.createElement("a");
        a.href = src;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ── Delete with Confirmation ───────────────────────────

    async function confirmDelete() {
        if (!_pendingDelete) return;

        const { source, id, row } = _pendingDelete;

        try {
            const delId = source === "about" ? "0" : id;
            await apiFetch(`/api/images/${source}/${delId}`, { method: "DELETE" });
            row.remove();

            // Check if table is now empty
            const tbody = document.querySelector(".images-table tbody");
            if (tbody && tbody.children.length === 0) {
                document.getElementById("images-list").innerHTML =
                    '<p class="images-empty">No uploaded images found.</p>';
            }
        } catch (e) {
            alert("Failed to delete image: " + e.message);
        }

        _pendingDelete = null;
        document.getElementById("delete-modal").classList.add("hidden");
    }

    function cancelDelete() {
        _pendingDelete = null;
        document.getElementById("delete-modal").classList.add("hidden");
    }

    // ── Modal Event Wiring ─────────────────────────────────

    function setupModals() {
        // Preview modal
        document.getElementById("preview-close").addEventListener("click", closePreview);
        document.querySelector(".preview-overlay").addEventListener("click", closePreview);

        // Delete modal
        document.getElementById("delete-yes").addEventListener("click", confirmDelete);
        document.getElementById("delete-no").addEventListener("click", cancelDelete);
        document.querySelector(".delete-overlay").addEventListener("click", cancelDelete);

        // ESC key closes both
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                closePreview();
                cancelDelete();
            }
        });
    }

    // ── Sanitization ───────────────────────────────────────

    function esc(str) {
        if (typeof str !== "string") return "";
        const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
        return str.replace(/[&<>"']/g, ch => map[ch]);
    }

    return { init };
})();
