// js/script.js
// Updated combined navbar + lightbox script
// - Robust DOM checks
// - Debounced search
// - Dynamic gallery refresh
// - Swipe support, keyboard, preload
// - Exposes window.galleryLightbox API

(function () {
  /* ==========================
     NAVBAR INTERACTIONS
     ========================== */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  const navSearch = document.getElementById('navSearch');
  const navSearchForm = document.getElementById('navSearchForm');
  const uploadBtn = document.getElementById('uploadBtn');

  // small debounce helper
  function debounce(fn, wait = 250) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Delegate link clicks to close mobile menu when needed
    navLinks.addEventListener('click', (e) => {
      const target = e.target;
      if (target.tagName === 'A' && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        navToggle.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Close menu with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        navToggle.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });

    // Active link switching (visual only)
    try {
      const linkEls = navLinks.querySelectorAll('a');
      linkEls.forEach(a => {
        a.addEventListener('click', (ev) => {
          linkEls.forEach(l => l.classList.remove('active'));
          ev.currentTarget.classList.add('active');
        });
      });
    } catch (err) {
      // ignore if navLinks has unexpected structure
    }
  }

  // Search handler — debounced. Replace onNavSearch with your search function.
  if (navSearchForm) {
    const submitHandler = (e) => {
      e.preventDefault();
      try {
        const q = navSearch?.value?.trim();
        if (typeof window.onNavSearch === 'function') window.onNavSearch(q);
      } catch (err) { console.error(err); }
    };
    navSearchForm.addEventListener('submit', submitHandler);
  }
  if (navSearch) {
    // run debounced on change or Enter
    const debounced = debounce(() => {
      const q = navSearch.value.trim();
      if (typeof window.onNavSearch === 'function') window.onNavSearch(q);
    }, 300);
    navSearch.addEventListener('input', debounced);
    navSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = navSearch.value.trim();
        if (typeof window.onNavSearch === 'function') window.onNavSearch(q);
      }
    });
  }

  // Upload button hook
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      if (typeof window.onUploadClicked === 'function') window.onUploadClicked();
      else console.log('Upload clicked — implement onUploadClicked() to open file dialog or modal.');
    });
  }

  // Default hooks (you can override these in your app)
  window.onNavSearch = window.onNavSearch || function (query) {
    console.log('Search query (from navbar):', query);
  };
  window.onUploadClicked = window.onUploadClicked || function () {
    console.log('Upload clicked — open upload dialog or modal');
  };

  /* ==========================
     LIGHTBOX / GALLERY
     ========================== */

  // DOM nodes (some may not exist — handle gracefully)
  const galleryContainer = document.getElementById('gallery') || document.getElementById('galleryGrid');
  const lb = document.getElementById('lightbox');
  const lbImage = document.getElementById('lbImage');
  const lbCaption = document.getElementById('lbCaption');
  const lbPrev = document.getElementById('lbPrev');
  const lbNext = document.getElementById('lbNext');
  const lbClose = document.getElementById('lbClose');
  const lbStage = document.getElementById('lbStage') || lbImage; // fallback

  // internal state
  let figures = [];     // elements for figures
  let images = [];      // {thumb, large, alt, el}
  let current = 0;
  let isOpen = false;
  let pointerSwipe = { active: false, startX: 0, dist: 0 };

  // Utility: safe query for gallery items
  function scanGallery() {
    figures = [];
    images = [];
    if (!galleryContainer) return;
    const nodes = Array.from(galleryContainer.querySelectorAll('.gallery-item'));
    nodes.forEach((fig, i) => {
      const img = fig.querySelector('img');
      if (!img) return;
      const thumb = img.src;
      const large = img.dataset?.large || img.src;
      const alt = img.alt || `Image ${i + 1}`;
      figures.push(fig);
      images.push({ thumb, large, alt, el: fig });
    });
    // attach click handlers
    figures.forEach((fig, i) => {
      // remove previous listeners safely by cloning? We'll use a simple guard:
      if (!fig._bound) {
        fig.addEventListener('click', () => openAt(i));
        fig.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') openAt(i);
        });
        fig.tabIndex = fig.tabIndex === undefined ? 0 : fig.tabIndex;
        fig._bound = true;
      }
    });
  }

  // initial scan
  scanGallery();

  // expose a refresh function to re-scan gallery (useful when images are added dynamically)
  function refreshGallery() {
    // clear bound flags so we rebind
    if (figures && figures.length) {
      figures.forEach(f => { try { delete f._bound; } catch (e) {} });
    }
    scanGallery();
  }

  // If gallery content may change, observe and refresh
  if (galleryContainer && window.MutationObserver) {
    const mo = new MutationObserver(debounce(() => { refreshGallery(); }, 150));
    mo.observe(galleryContainer, { childList: true, subtree: true, attributes: true });
  }

  // Lightbox open/close/update
  function openAt(index) {
    if (!images.length || !lb) return;
    current = ((index % images.length) + images.length) % images.length;
    update();
    document.body.style.overflow = 'hidden';
    lb.setAttribute('aria-hidden', 'false');
    isOpen = true;
    // focus stage for keyboard
    try { lbStage.focus(); } catch (e) {}
  }

  function closeLB() {
    if (!lb) return;
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    isOpen = false;
  }

  function update() {
    if (!images.length || !lbImage) return;
    const it = images[current];
    // small fade for nicer transition
    lbImage.style.transition = 'opacity 140ms';
    lbImage.style.opacity = '0';
    setTimeout(() => {
      lbImage.src = it.large;
      lbImage.alt = it.alt;
      if (lbCaption) lbCaption.textContent = it.alt;
      lbImage.style.opacity = '1';
      preloadNeighbors(current);
    }, 100);
  }

  function next() {
    if (!images.length) return;
    current = (current + 1) % images.length;
    update();
  }
  function prev() {
    if (!images.length) return;
    current = (current - 1 + images.length) % images.length;
    update();
  }

  // Preload neighbors for smooth navigation
  function preloadNeighbors(idx) {
    [-1, 1].forEach(offset => {
      const n = (idx + offset + images.length) % images.length;
      const img = new Image();
      img.src = images[n].large;
    });
  }

  // Attach controls if present
  if (lbNext) lbNext.addEventListener('click', (e) => { e.stopPropagation(); next(); });
  if (lbPrev) lbPrev.addEventListener('click', (e) => { e.stopPropagation(); prev(); });
  if (lbClose) lbClose.addEventListener('click', (e) => { e.stopPropagation(); closeLB(); });

  // Backdrop click closes
  if (lb) {
    lb.addEventListener('click', (e) => {
      if (e.target === lb) closeLB();
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') closeLB();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  });

  // Pointer swipe support on lbStage (if available)
  if (lbStage && typeof lbStage.addEventListener === 'function') {
    lbStage.addEventListener('pointerdown', (e) => {
      pointerSwipe.active = true;
      pointerSwipe.startX = e.clientX;
      lbStage.setPointerCapture?.(e.pointerId);
    });
    lbStage.addEventListener('pointermove', (e) => {
      if (!pointerSwipe.active) return;
      pointerSwipe.dist = e.clientX - pointerSwipe.startX;
    });
    lbStage.addEventListener('pointerup', () => {
      if (!pointerSwipe.active) return;
      const threshold = 40; // px
      if (pointerSwipe.dist > threshold) prev();
      else if (pointerSwipe.dist < -threshold) next();
      pointerSwipe.active = false;
      pointerSwipe.dist = 0;
    });
    lbStage.addEventListener('pointercancel', () => {
      pointerSwipe.active = false;
      pointerSwipe.dist = 0;
    });
  }

  // Preload when image src changes (fallback/preload hook)
  if (lbImage && window.MutationObserver) {
    const imgObserver = new MutationObserver(() => { preloadNeighbors(current); });
    imgObserver.observe(lbImage, { attributes: true, attributeFilter: ['src'] });
  }

  // Public API for other scripts (e.g., links modal Open buttons)
  window.galleryLightbox = window.galleryLightbox || {
    openAt,
    close: closeLB,
    next,
    prev,
    refresh: refreshGallery
  };

  // Initialize: if there are auto-open attributes, etc. (none by default)
  // Example: open first image by default -> openAt(0);

  /* ==========================
     END OF SCRIPT
     ========================== */
})();


// Collections: auto-detect from gallery images (data-collections) and render UI
(function () {
  const galleryContainer = document.getElementById('gallery') || document.getElementById('galleryGrid');
  const collectionsListEl = document.getElementById('collectionsList');
  const showAllBtn = document.getElementById('showAllBtn');

  const collectionModal = document.getElementById('collectionModal');
  const collectionTitle = document.getElementById('collectionTitle');
  const collectionModalBody = document.getElementById('collectionModalBody');
  const closeCollectionModal = document.getElementById('closeCollectionModal');
  const closeCollectionFooter = document.getElementById('closeCollectionFooter');

  if (!galleryContainer || !collectionsListEl) return;

  // Build name -> items map
  function buildCollections() {
    const map = {};
    const imgs = Array.from(galleryContainer.querySelectorAll('.gallery-item img'));
    imgs.forEach((img, i) => {
      const names = (img.dataset.collections || '').split(',').map(s => s.trim()).filter(Boolean);
      const url = img.dataset.large || img.src;
      const thumb = img.src;
      const title = img.alt || img.dataset.title || `Image ${i+1}`;
      names.forEach(name => {
        map[name] = map[name] || [];
        map[name].push({ thumb, url, title, el: img.closest('.gallery-item') });
      });
    });
    return map;
  }

  // Render collection cards
  function renderCollectionCards() {
    const map = buildCollections();
    collectionsListEl.innerHTML = '';
    const names = Object.keys(map).sort();
    if (!names.length) {
      collectionsListEl.innerHTML = '<div style="color:#556">No collections found. Add <code>data-collections</code> to images.</div>';
      return;
    }
    names.forEach(name => {
      const items = map[name];
      const card = document.createElement('div');
      card.className = 'collection-card';
      card.tabIndex = 0;
      card.innerHTML = `
        <img class="col-thumb" src="${items[0].thumb}" alt="${name}">
        <div class="col-meta">
          <div class="col-name">${name}</div>
          <div class="col-count">${items.length} image${items.length !== 1 ? 's' : ''}</div>
        </div>`;
      card.addEventListener('click', () => openCollectionModal(name, items));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openCollectionModal(name, items); });
      collectionsListEl.appendChild(card);
    });
  }

  // Open modal with thumbnails for a collection
  function openCollectionModal(name, items) {
    collectionTitle.textContent = `Collection: ${name}`;
    collectionModalBody.innerHTML = '';
    items.forEach((it, idx) => {
      const img = document.createElement('img');
      img.className = 'collection-thumb';
      img.src = it.thumb;
      img.alt = it.title || `${name} ${idx+1}`;
      img.tabIndex = 0;
      img.addEventListener('click', () => openItemInLightbox(it));
      img.addEventListener('keydown', (e) => { if (e.key === 'Enter') openItemInLightbox(it); });
      collectionModalBody.appendChild(img);
    });
    collectionModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  // Close modal
  function closeCollectionModalFn() {
    collectionModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Open an item in gallery lightbox (matching current gallery scan)
  function openItemInLightbox(item) {
    // Attempt to find the index in the current gallery scanning order
    const visibleImgs = Array.from(galleryContainer.querySelectorAll('.gallery-item img'));
    const idx = visibleImgs.findIndex(img => (img.dataset.large || img.src) === item.url);
    if (typeof window.galleryLightbox?.openAt === 'function' && idx !== -1) {
      window.galleryLightbox.openAt(idx);
    } else if (typeof window.galleryLightbox?.openAt === 'function' && idx === -1) {
      // If not found (maybe filtered), refresh then try again
      if (typeof window.galleryLightbox?.refresh === 'function') {
        window.galleryLightbox.refresh();
        const reVisible = Array.from(galleryContainer.querySelectorAll('.gallery-item img'));
        const idx2 = reVisible.findIndex(img => (img.dataset.large || img.src) === item.url);
        if (idx2 !== -1) window.galleryLightbox.openAt(idx2);
        else window.open(item.url, '_blank');
      } else {
        window.open(item.url, '_blank');
      }
    } else {
      // fallback: open url in new tab
      window.open(item.url, '_blank');
    }
    closeCollectionModalFn();
  }

  // Show all images (clear filters)
  function showAll() {
    const figs = Array.from(galleryContainer.querySelectorAll('.gallery-item'));
    figs.forEach(f => (f.style.display = ''));
    if (typeof window.galleryLightbox?.refresh === 'function') window.galleryLightbox.refresh();
  }

  // Wire modal and buttons
  showAllBtn?.addEventListener('click', showAll);
  closeCollectionModal?.addEventListener('click', closeCollectionModalFn);
  closeCollectionFooter?.addEventListener('click', closeCollectionModalFn);
  collectionModal?.addEventListener('click', (e) => { if (e.target === collectionModal) closeCollectionModalFn(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && collectionModal.getAttribute('aria-hidden') === 'false') closeCollectionModalFn(); });

  // Initialize
  renderCollectionCards();

  // Expose API
  window.galleryCollections = {
    render: renderCollectionCards,
    open: openCollectionModal,
    showAll
  };

  // Optional: if gallery changes dynamically, re-render collections when DOM mutates
  if (galleryContainer && window.MutationObserver) {
    const mo = new MutationObserver(() => renderCollectionCards());
    mo.observe(galleryContainer, { childList: true, subtree: true, attributes: true });
  }
})();



 document.getElementById('showAllBtn').addEventListener('click', function() {
    const items = document.querySelectorAll('.gallery-item');
    items.forEach(item => {
      item.style.display = 'block';
    });
  });


  document.getElementById('searchInput').addEventListener('keyup', function() {
  let filter = this.value.toLowerCase();
  let images = document.querySelectorAll('.gallery-item');

  images.forEach(function(image) {
    let caption = image.getAttribute('data-name').toLowerCase();
    if (caption.includes(filter)) {
      image.style.display = '';
    } else {
      image.style.display = 'none';
    }
  });
});
