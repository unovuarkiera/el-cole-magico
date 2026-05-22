// =============================================
// StoryOwl — Generación en vivo compartida
// Elimina el overlay negro y muestra el cuento
// construyéndose página a página en tiempo real
// =============================================

function initGeneradorUI() {

  // Ocultar overlay y mostrar libro desde el principio
  function mostrarLibroEnVivo() {
    const overlay = document.getElementById('overlay');
    const bookSection = document.getElementById('bookSection');
    if (overlay) overlay.classList.remove('show');
    if (bookSection) bookSection.style.display = 'block';
  }

  // Barra de progreso superior
  function crearBarraProgreso() {
    const barra = document.createElement('div');
    barra.id = 'progress-bar';
    barra.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      height: 4px;
      width: 0%;
      background: linear-gradient(90deg, #f7c94b, #6b3fa8, #f7c94b);
      background-size: 200% 100%;
      animation: shimmer 2s infinite;
      z-index: 9999;
      transition: width 0.5s ease;
      border-radius: 0 2px 2px 0;
    `;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      @keyframes pageSlideIn { from{opacity:0;transform:translateY(40px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes coverAppear { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
      .page-live { animation: pageSlideIn 0.6s cubic-bezier(.34,1.56,.64,1) both; }
      .cover-live { animation: coverAppear 0.8s ease both; }
      .generating-indicator { display:flex; align-items:center; gap:10px; padding:16px 20px; background:rgba(58,32,112,.06); border-radius:12px; margin-bottom:16px; font-size:14px; color:#7a6a9a; border:1px solid rgba(58,32,112,.1); }
      .generating-dot { width:8px; height:8px; border-radius:50%; background:#6b3fa8; animation:pulse 1s infinite; flex-shrink:0; }
      @keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
      .page-skeleton { background:white; border-radius:24px; overflow:hidden; margin-bottom:32px; box-shadow:0 4px 24px rgba(58,32,112,.08); }
      .skeleton-img { width:100%; aspect-ratio:2/3; background:linear-gradient(90deg,#f0ebff 25%,#e8e0ff 50%,#f0ebff 75%); background-size:200% 100%; animation:skeleton 1.5s infinite; }
      .skeleton-body { padding:24px 28px; }
      .skeleton-line { height:12px; border-radius:6px; background:linear-gradient(90deg,#f0ebff 25%,#e8e0ff 50%,#f0ebff 75%); background-size:200% 100%; animation:skeleton 1.5s infinite; margin-bottom:10px; }
      @keyframes skeleton { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      #status-bar { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:rgba(26,15,48,.92); backdrop-filter:blur(12px); color:white; padding:12px 24px; border-radius:50px; font-size:14px; font-weight:700; z-index:9998; display:flex; align-items:center; gap:10px; box-shadow:0 8px 32px rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.1); transition:all .3s; white-space:nowrap; }
      #status-bar .status-dot { width:8px; height:8px; border-radius:50%; background:#f7c94b; animation:pulse 1s infinite; flex-shrink:0; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(barra);
    return barra;
  }

  // Barra de estado inferior
  function crearStatusBar() {
    const bar = document.createElement('div');
    bar.id = 'status-bar';
    bar.innerHTML = '<div class="status-dot"></div><span id="status-text">🦉 Preparando tu cuento...</span>';
    document.body.appendChild(bar);
    return bar;
  }

  // Actualizar progreso
  function actualizarProgreso(paginaActual, totalPaginas) {
    const barra = document.getElementById('progress-bar');
    if (barra) {
      const pct = Math.round((paginaActual / (totalPaginas + 2)) * 100);
      barra.style.width = pct + '%';
    }
  }

  // Indicador de "generando siguiente página"
  function mostrarIndicadorGenerando(numeroPagina, total) {
    const container = document.getElementById('pagesContainer');
    if (!container) return;
    const old = document.getElementById('generating-next');
    if (old) old.remove();
    const ind = document.createElement('div');
    ind.id = 'generating-next';
    ind.className = 'generating-indicator';
    ind.innerHTML = `<div class="generating-dot"></div><span>Creando ilustración ${numeroPagina} de ${total}...</span>`;
    container.appendChild(ind);
    ind.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // Eliminar indicador
  function quitarIndicador() {
    const ind = document.getElementById('generating-next');
    if (ind) ind.remove();
  }

  // Procesar eventos del stream
  window.procesarEventoLive = function(data, totalPaginas) {
    totalPaginas = totalPaginas || 16;

    if (data.tipo === 'estado') {
      const statusText = document.getElementById('status-text');
      if (statusText) statusText.textContent = data.mensaje;

      // Mostrar libro en cuanto empiece
      mostrarLibroEnVivo();

    } else if (data.tipo === 'cuento') {
      const bookTitle = document.getElementById('bookTitle');
      const bookDed = document.getElementById('bookDed');
      if (bookTitle) bookTitle.textContent = data.titulo;
      if (bookDed) bookDed.textContent = data.dedicatoria;

      const bookSection = document.getElementById('bookSection');
      if (bookSection) {
        bookSection.style.display = 'block';
        bookSection.scrollIntoView({ behavior: 'smooth' });
      }
      actualizarProgreso(1, totalPaginas);
      mostrarIndicadorGenerando(1, totalPaginas);

    } else if (data.tipo === 'imagen') {
      // Portada
      const img = document.getElementById('coverImg');
      if (img) {
        img.src = data.url;
        img.style.display = 'block';
        img.classList.add('cover-live');
      }
      actualizarProgreso(2, totalPaginas);

    } else if (data.tipo === 'pagina') {
      quitarIndicador();
      const container = document.getElementById('pagesContainer');
      if (!container) return;

      const page = document.createElement('div');
      page.className = 'page page-live';
      page.innerHTML = `
        <img class="page-img" src="${data.url}" alt="Página ${data.numero}" loading="lazy"
          onerror="this.style.background='linear-gradient(135deg,#e8e0ff,#f0ebff)';this.style.minHeight='200px'"/>
        <div class="page-body">
          <div class="page-num">Página ${data.numero}</div>
          <div class="page-title">${data.titulo}</div>
          <p class="page-text">${data.texto}</p>
        </div>`;
      container.appendChild(page);
      setTimeout(() => page.classList.add('visible'), 50);

      actualizarProgreso(data.numero + 2, totalPaginas);

      if (data.numero < totalPaginas) {
        mostrarIndicadorGenerando(data.numero + 1, totalPaginas);
      }

      page.scrollIntoView({ behavior: 'smooth', block: 'end' });

    } else if (data.tipo === 'completado') {
      quitarIndicador();

      // Barra al 100%
      const barra = document.getElementById('progress-bar');
      if (barra) {
        barra.style.width = '100%';
        setTimeout(() => { barra.style.opacity = '0'; }, 1000);
      }

      // Quitar status bar
      const statusBar = document.getElementById('status-bar');
      if (statusBar) {
        statusBar.style.opacity = '0';
        setTimeout(() => statusBar.remove(), 500);
      }

      const endSection = document.getElementById('endSection');
      if (endSection) {
        endSection.style.display = 'block';
        endSection.scrollIntoView({ behavior: 'smooth' });
      }

      const btnGenerar = document.getElementById('btnGenerar');
      if (btnGenerar) btnGenerar.disabled = false;

    } else if (data.tipo === 'error') {
      quitarIndicador();
      const statusBar = document.getElementById('status-bar');
      if (statusBar) statusBar.remove();
      const barra = document.getElementById('progress-bar');
      if (barra) barra.remove();
      const btnGenerar = document.getElementById('btnGenerar');
      if (btnGenerar) btnGenerar.disabled = false;
      alert('Error: ' + data.mensaje);
    }
  };

  // Función principal de generación
  window.generarConLive = async function(endpoint, datos, totalPaginas) {
    totalPaginas = totalPaginas || 16;

    // Reset UI
    const bookSection = document.getElementById('bookSection');
    const pagesContainer = document.getElementById('pagesContainer');
    const endSection = document.getElementById('endSection');
    const coverImg = document.getElementById('coverImg');
    const btnGenerar = document.getElementById('btnGenerar');
    const overlay = document.getElementById('overlay');

    if (overlay) overlay.classList.remove('show');
    if (bookSection) bookSection.style.display = 'none';
    if (pagesContainer) pagesContainer.innerHTML = '';
    if (endSection) endSection.style.display = 'none';
    if (coverImg) { coverImg.src = ''; coverImg.style.display = 'none'; }
    if (btnGenerar) btnGenerar.disabled = true;

    // Crear elementos de progreso
    crearBarraProgreso();
    crearStatusBar();

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            window.procesarEventoLive(JSON.parse(line.slice(5)), totalPaginas);
          } catch(e) {}
        }
      }
    } catch(e) {
      const statusBar = document.getElementById('status-bar');
      if (statusBar) statusBar.remove();
      const barra = document.getElementById('progress-bar');
      if (barra) barra.remove();
      if (btnGenerar) btnGenerar.disabled = false;
      alert('Error: ' + e.message);
    }
  };
}

// Inicializar
initGeneradorUI();
