// Plugin de Capacitor para acceder al acelerómetro del dispositivo
import { Motion } from '@capacitor/motion';

// =============================================
// CONFIGURACIÓN DE LA API
// =============================================

// APIKey de Google Books — no exponer en repositorios públicos.
// Para entregar al profesor, incluir en archivo separado "api-key.txt"
const GOOGLE_BOOKS_KEY = 'AIzaSyBukQPDIz63qlhXe3UH--3-tvFMHEp9NOY';
const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

// =============================================
// PALETA DE COLORES
// =============================================

// Tonos nude y malva apagado para mantener coherencia con la estética de la app.
// Se usa cuando un libro no tiene portada real de la API.
const COLORS = [
  '#c4a8b0', '#b0a0b8', '#d4b8b0', '#a8b0c0',
  '#c8b0a8', '#b8a8c0', '#d0b8c0', '#b0b8c8',
];

// =============================================
// ESTADO GLOBAL
// =============================================

let books = [];        // Array de libros pendientes del usuario
let winner = null;     // Libro ganador del último sorteo
let animating = false; // Controla si la animación de sorteo está en curso
let animFrame = 0;     // Contador de frames para controlar la duración de la animación
let cards = [];        // Copia de los libros con propiedades físicas para la animación
let p5Instance = null; // Referencia a la instancia de p5.js
let coverImages = {};  // Cache de imágenes p5.Image indexadas por título, para el canvas

// Temporizador para el debounce de la búsqueda en vivo
let searchDebounceTimer = null;

// =============================================
// PERSISTENCIA CON LOCALSTORAGE
// =============================================

// Guarda el array de libros en localStorage como JSON
function saveBooks() {
  localStorage.setItem('cualleo_books', JSON.stringify(books));
}

// Recupera los libros guardados al arrancar la app y renderiza la lista
function loadBooks() {
  const value = localStorage.getItem('cualleo_books');
  if (value) {
    books = JSON.parse(value);
  }
  renderList();
}

// =============================================
// GOOGLE BOOKS API
// =============================================

/**
 * Busca libros en Google Books API con una query dada.
 * Devuelve un array de objetos con los datos relevantes para la app.
 * @param {string} query - Texto de búsqueda
 * @param {number} maxResults - Número máximo de resultados (por defecto 8)
 * @returns {Promise<Array>} Array de libros formateados
 */
async function fetchBooks(query, maxResults = 8) {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({
    q: query,
    maxResults,
    langRestrict: 'es',  // Preferimos resultados en español
    key: GOOGLE_BOOKS_KEY,
  });

  try {
    const response = await fetch(`${GOOGLE_BOOKS_URL}?${params}`);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();

    if (!data.items) return [];

    // Mapeamos los items de la API a un formato simplificado para la app
    return data.items.map((item) => {
      const info = item.volumeInfo || {};
      return {
        googleId: item.id,
        title: info.title || 'Sin título',
        author: info.authors ? info.authors.join(', ') : 'Autor desconocido',
        thumbnail: info.imageLinks?.thumbnail?.replace('http://', 'https://') || null,
        description: info.description
          ? info.description.substring(0, 200) + (info.description.length > 200 ? '…' : '')
          : null,
        year: info.publishedDate ? info.publishedDate.substring(0, 4) : null,
        pages: info.pageCount || null,
        categories: info.categories ? info.categories[0] : null,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
  } catch (err) {
    console.error('Error en Google Books API:', err);
    return [];
  }
}

// =============================================
// BÚSQUEDA CON AUTOCOMPLETADO (PESTAÑA PENDIENTES)
// =============================================

/**
 * Muestra u oculta el spinner de búsqueda
 * @param {string} spinnerId - ID del elemento spinner
 * @param {boolean} visible
 */
function setSpinner(spinnerId, visible) {
  const spinner = document.getElementById(spinnerId);
  if (spinner) spinner.style.display = visible ? 'block' : 'none';
}

/**
 * Renderiza el dropdown de sugerencias bajo el campo de título.
 * Cada sugerencia tiene portada, título y autor y al hacer clic
 * rellena el formulario y opcionalmente añade el libro directamente.
 * @param {Array} results - Array de libros de Google Books
 */
function renderSuggestions(results) {
  const container = document.getElementById('suggestions');
  container.innerHTML = '';

  if (results.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  results.forEach((book) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';

    // Miniatura de portada o placeholder de color
    const thumb = document.createElement('div');
    thumb.className = 'suggestion-thumb';
    if (book.thumbnail) {
      thumb.style.backgroundImage = `url(${book.thumbnail})`;
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
    } else {
      thumb.style.background = book.color;
    }

    const info = document.createElement('div');
    info.className = 'suggestion-info';
    info.innerHTML = `
      <div class="suggestion-title">${book.title}</div>
      <div class="suggestion-author">${book.author}${book.year ? ` · ${book.year}` : ''}</div>
    `;

    item.appendChild(thumb);
    item.appendChild(info);

    // Al hacer clic rellenamos los campos y ocultamos el dropdown
    item.addEventListener('click', () => {
      document.getElementById('input-title').value = book.title;
      document.getElementById('input-author').value = book.author;
      // Guardamos los metadatos extra en atributos de datos del input para usarlos al añadir
      document.getElementById('input-title').dataset.bookData = JSON.stringify(book);
      container.style.display = 'none';
    });

    container.appendChild(item);
  });
}

/**
 * Handler del input de búsqueda con debounce de 400ms
 * para no saturar la API con cada pulsación de tecla
 */
function onTitleInput() {
  const query = document.getElementById('input-title').value.trim();

  // Limpiamos los datos de libro seleccionado si el usuario modifica el texto
  delete document.getElementById('input-title').dataset.bookData;

  clearTimeout(searchDebounceTimer);

  if (query.length < 2) {
    document.getElementById('suggestions').style.display = 'none';
    setSpinner('search-spinner', false);
    return;
  }

  setSpinner('search-spinner', true);

  searchDebounceTimer = setTimeout(async () => {
    const results = await fetchBooks(query, 6);
    setSpinner('search-spinner', false);
    renderSuggestions(results);
  }, 400);
}

// =============================================
// GESTIÓN DE LIBROS
// =============================================

/**
 * Añade un nuevo libro al array.
 * Si el usuario seleccionó una sugerencia de la API, usa esos datos completos.
 * Si escribió manualmente, crea un libro básico.
 */
function addBook() {
  const titleInput = document.getElementById('input-title');
  const authorInput = document.getElementById('input-author');
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!title) return;

  // Comprobamos si el usuario seleccionó una sugerencia de la API
  let newBook;
  if (titleInput.dataset.bookData) {
    // Libro con datos completos de Google Books
    newBook = JSON.parse(titleInput.dataset.bookData);
    newBook.color = COLORS[books.length % COLORS.length];
  } else {
    // Libro añadido manualmente sin datos de la API
    newBook = {
      title,
      author: author || 'Autor desconocido',
      thumbnail: null,
      description: null,
      year: null,
      pages: null,
      categories: null,
      color: COLORS[books.length % COLORS.length],
    };
  }

  books.push(newBook);

  // Limpiamos los inputs y metadatos
  titleInput.value = '';
  titleInput.dataset.bookData = '';
  authorInput.value = '';
  document.getElementById('suggestions').style.display = 'none';

  saveBooks();
  renderList();

  // Si el canvas de p5 ya está inicializado, lo actualizamos
  if (p5Instance) {
    coverImages = {}; // Reseteamos la cache de portadas para recargar
    drawIdle(p5Instance);
  }
}

/**
 * Renderiza la lista de libros en el DOM.
 * Usamos createElement para compatibilidad con módulos ES.
 */
function renderList() {
  const list = document.getElementById('book-list');
  document.getElementById('count').textContent = books.length;

  if (books.length === 0) {
    list.innerHTML = '<div class="empty-state">Tu lista de pendientes está vacía.<br>Busca un libro arriba para empezar.</div>';
    return;
  }

  list.innerHTML = '';

  books.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = 'book-item';

    // Miniatura de portada o punto de color
    const thumb = document.createElement('div');
    thumb.className = 'book-thumb';
    if (b.thumbnail) {
      thumb.style.backgroundImage = `url(${b.thumbnail})`;
      thumb.style.backgroundSize = 'cover';
      thumb.style.backgroundPosition = 'center';
      thumb.style.borderRadius = '4px';
    } else {
      thumb.classList.add('book-thumb--color');
      thumb.style.background = b.color;
    }

    const info = document.createElement('div');
    info.className = 'book-info';
    info.innerHTML = `
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}${b.year ? ` · ${b.year}` : ''}</div>
    `;

    // Botón de borrar
    const del = document.createElement('button');
    del.className = 'book-del';
    del.textContent = '×';
    del.addEventListener('click', () => {
      books.splice(i, 1);
      saveBooks();
      renderList();
      if (p5Instance) {
        coverImages = {};
        drawIdle(p5Instance);
      }
    });

    el.appendChild(thumb);
    el.appendChild(info);
    el.appendChild(del);
    list.appendChild(el);
  });
}

// =============================================
// PESTAÑA DESCUBRIR
// =============================================

/**
 * Busca libros en Google Books y renderiza los resultados
 * en la pestaña Descubrir como tarjetas con portada y descripción.
 */
async function discoverSearch() {
  const query = document.getElementById('discover-input').value.trim();
  if (!query) return;

  setSpinner('discover-spinner', true);
  document.getElementById('discover-grid').innerHTML = '';
  document.getElementById('discover-empty').style.display = 'none';

  const results = await fetchBooks(query, 12);
  setSpinner('discover-spinner', false);

  if (results.length === 0) {
    document.getElementById('discover-empty').style.display = 'flex';
    document.getElementById('discover-empty').querySelector('p').textContent =
      'No se encontraron resultados. Intenta con otro término.';
    return;
  }

  renderDiscoverResults(results);
}

/**
 * Renderiza las tarjetas de resultados en la pestaña Descubrir.
 * Cada tarjeta muestra portada, título, autor, año y sinopsis,
 * con un botón para añadir el libro a la lista de pendientes.
 * @param {Array} results - Array de libros de Google Books
 */
function renderDiscoverResults(results) {
  const grid = document.getElementById('discover-grid');
  grid.innerHTML = '';

  results.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'discover-card';

    // Portada del libro
    const cover = document.createElement('div');
    cover.className = 'discover-cover';
    if (book.thumbnail) {
      cover.style.backgroundImage = `url(${book.thumbnail})`;
      cover.style.backgroundSize = 'cover';
      cover.style.backgroundPosition = 'center';
    } else {
      cover.style.background = book.color;
      cover.innerHTML = `<span class="discover-cover-placeholder">${book.title.charAt(0)}</span>`;
    }

    // Info del libro
    const info = document.createElement('div');
    info.className = 'discover-info';

    const meta = book.year || book.categories
      ? `<div class="discover-meta">${[book.year, book.categories].filter(Boolean).join(' · ')}</div>`
      : '';

    info.innerHTML = `
      <div class="discover-title">${book.title}</div>
      <div class="discover-author">${book.author}</div>
      ${meta}
      ${book.description ? `<div class="discover-desc">${book.description}</div>` : ''}
    `;

    // Botón de añadir a pendientes
    const btn = document.createElement('button');

    // Comprobamos si el libro ya está en la lista
    const alreadyAdded = books.some(
      (b) => b.title.toLowerCase() === book.title.toLowerCase()
    );

    btn.className = alreadyAdded ? 'discover-add-btn discover-add-btn--added' : 'discover-add-btn';
    btn.textContent = alreadyAdded ? '✓ Añadido' : '+ Añadir';

    btn.addEventListener('click', () => {
      if (btn.classList.contains('discover-add-btn--added')) return;

      // Asignamos color de la paleta y añadimos a la lista
      book.color = COLORS[books.length % COLORS.length];
      books.push(book);
      saveBooks();
      renderList();

      // Feedback visual en el botón
      btn.textContent = '✓ Añadido';
      btn.classList.add('discover-add-btn--added');

      if (p5Instance) {
        coverImages = {};
        drawIdle(p5Instance);
      }
    });

    card.appendChild(cover);
    card.appendChild(info);
    card.appendChild(btn);
    grid.appendChild(card);
  });
}

// =============================================
// ANIMACIÓN P5.JS
// =============================================

/**
 * Precarga las portadas de los libros como p5.Image para poder dibujarlas en el canvas.
 * Solo carga las que no están ya en cache.
 * @param {p5} sketch - Instancia de p5
 */
function preloadCovers(sketch) {
  books.forEach((book) => {
    if (book.thumbnail && !coverImages[book.title]) {
      coverImages[book.title] = sketch.loadImage(
        book.thumbnail,
        () => {}, // onSuccess — no hace falta callback
        () => { coverImages[book.title] = null; } // onError — marcamos como fallida
      );
    }
  });
}

/**
 * Inicializa la instancia de p5.js en modo instancia para evitar conflictos con módulos ES.
 * Se llama la primera vez que el usuario abre la pestaña de sorteo.
 */
function initP5() {
  const container = document.getElementById('canvas-container');

  p5Instance = new p5((sketch) => {

    // preload() se ejecuta antes de setup() — cargamos las portadas aquí
    sketch.preload = function () {
      preloadCovers(sketch);
    };

    // setup() se ejecuta una sola vez al iniciar el sketch
    sketch.setup = function () {
      const canvas = sketch.createCanvas(container.offsetWidth, 260);
      canvas.parent('canvas-container');
      sketch.noLoop(); // Solo redibujamos cuando es necesario
      drawIdle(sketch);
    };

    // draw() se ejecuta en bucle solo durante la animación de sorteo
    sketch.draw = function () {
      if (!animating) return;
      animFrame++;

      sketch.background('#2d1245');

      let stillGoing = false;

      // Actualizamos la física de cada carta/libro
      cards.forEach((c) => {
        // El ganador se detiene en el centro a partir del frame 45
        if (c.isWinner && animFrame > 45) return;

        // Física: posición, gravedad, fricción y rotación
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.45;  // Gravedad
        c.vx *= 0.98;  // Fricción horizontal
        c.angle += c.va;

        // Los libros perdedores se desvanecen gradualmente
        if (!c.isWinner) c.alpha -= 0.022;

        if (c.alpha > 0) {
          drawBook(sketch, c.x, c.y, c.book, c.angle, Math.max(0, c.alpha));
          if (c.alpha > 0.01) stillGoing = true;
        }
      });

      // Mantenemos la animación al menos 65 frames
      if (animFrame < 65) stillGoing = true;

      // Cuando la animación termina mostramos el ganador
      if (!stillGoing) {
        animating = false;
        sketch.noLoop();
        sketch.background('#2d1245');
        drawBook(sketch, sketch.width / 2, sketch.height / 2, winner, 0, 1);
        // Si el ganador tiene portada, la dibujamos sobre el lomo
        if (winner.thumbnail && coverImages[winner.title]) {
          drawCoverOnCanvas(sketch, sketch.width / 2, sketch.height / 2, winner);
        }
        showResult();
      }
    };
  });
}

/**
 * Dibuja los libros apilados en el canvas en estado de reposo.
 * Si un libro tiene portada cargada, la muestra en miniatura sobre el lomo.
 * @param {p5} sketch - Instancia de p5
 */
function drawIdle(sketch) {
  sketch.background('#2d1245');

  if (books.length === 0) {
    sketch.fill('rgba(201,160,232,0.4)');
    sketch.noStroke();
    sketch.textAlign(sketch.CENTER, sketch.CENTER);
    sketch.textSize(13);
    sketch.text('Añade libros para elegir', sketch.width / 2, sketch.height / 2);
    return;
  }

  const bw = 36, bh = 105;
  const total = Math.min(books.length, 8);
  const startX = sketch.width / 2 - (total * (bw + 8)) / 2 + bw / 2;

  for (let i = 0; i < total; i++) {
    const x = startX + i * (bw + 8);
    const y = sketch.height / 2 + Math.sin(i * 0.9) * 5;
    const angle = (i % 2 === 0 ? 1 : -1) * 0.03;
    drawBook(sketch, x, y, books[i % books.length], angle, 1);
  }
}

/**
 * Dibuja un libro individual en el canvas con sus propiedades visuales.
 * Si tiene portada cargada la muestra sobre el lomo.
 * @param {p5} sketch - Instancia de p5
 * @param {number} x - Posición X del centro del libro
 * @param {number} y - Posición Y del centro del libro
 * @param {Object} book - Objeto libro
 * @param {number} angle - Ángulo de rotación en radianes
 * @param {number} alpha - Transparencia (0-1)
 */
function drawBook(sketch, x, y, book, angle, alpha) {
  const bw = 36, bh = 105;
  sketch.push();
  sketch.translate(x, y);
  sketch.rotate(angle);

  // Sombra
  sketch.noStroke();
  sketch.fill(0, 0, 0, 40 * alpha);
  sketch.rect(-bw / 2 + 3, -bh / 2 + 3, bw, bh, 8);

  // Cuerpo del libro
  const c = sketch.color(book.color);
  c.setAlpha(alpha * 255);
  sketch.fill(c);
  sketch.rect(-bw / 2, -bh / 2, bw, bh, 8);

  // Si tiene portada cargada, la dibujamos sobre el lomo
  if (book.thumbnail && coverImages[book.title]) {
    sketch.push();
    sketch.drawingContext.globalAlpha = alpha;
    sketch.image(coverImages[book.title], -bw / 2, -bh / 2, bw, bh);
    // Redondeamos los bordes de la imagen con clip
    sketch.drawingContext.globalAlpha = 1;
    sketch.pop();
  } else {
    // Sin portada: reflejo de lomo y título vertical
    sketch.fill(255, 255, 255, 55 * alpha);
    sketch.rect(-bw / 2, -bh / 2, 6, bh, 4);

    sketch.fill(255, 255, 255, 200 * alpha);
    sketch.textAlign(sketch.CENTER, sketch.CENTER);
    sketch.textSize(7.5);
    sketch.push();
    sketch.rotate(-sketch.HALF_PI);
    const short = book.title.length > 16 ? book.title.substring(0, 15) + '…' : book.title;
    sketch.text(short, 0, 0);
    sketch.pop();
  }

  sketch.pop();
}

/**
 * Dibuja la portada del libro ganador a mayor tamaño en el canvas
 * al finalizar la animación de sorteo.
 * @param {p5} sketch
 * @param {number} x
 * @param {number} y
 * @param {Object} book
 */
function drawCoverOnCanvas(sketch, x, y, book) {
  const cw = 80, ch = 120;
  sketch.push();
  sketch.translate(x, y);
  sketch.image(coverImages[book.title], -cw / 2, -ch / 2, cw, ch);
  sketch.pop();
}

// =============================================
// SORTEO
// =============================================

/**
 * Inicia la animación de sorteo.
 * Selecciona un ganador aleatorio y lanza la animación de física en p5.
 */
function startShuffle() {
  if (animating || books.length === 0 || !p5Instance) return;

  document.getElementById('result-card').style.display = 'none';

  // Precargamos portadas nuevas si las hay
  preloadCovers(p5Instance);

  winner = books[Math.floor(Math.random() * books.length)];
  animating = true;
  animFrame = 0;

  cards = books.map((b) => ({
    book: b,
    x: p5Instance.width / 2,
    y: p5Instance.height / 2,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 9 - 3,
    angle: (Math.random() - 0.5) * 0.2,
    va: (Math.random() - 0.5) * 0.12,
    alpha: 1,
    isWinner: b === winner,
  }));

  p5Instance.loop();
}

/**
 * Muestra la tarjeta de resultado con los datos completos del libro ganador.
 * Si el libro tiene datos de Google Books, muestra portada, sinopsis y metadatos.
 */
function showResult() {
  const card = document.getElementById('result-card');
  card.style.display = 'block';

  document.getElementById('result-title').textContent = winner.title;
  document.getElementById('result-author').textContent = winner.author;

  // Portada del ganador en la tarjeta de resultado
  const coverImg = document.getElementById('result-cover');
  if (winner.thumbnail) {
    coverImg.src = winner.thumbnail;
    coverImg.style.display = 'block';
  } else {
    coverImg.style.display = 'none';
  }

  // Metadatos: año, páginas, categoría
  const metaEl = document.getElementById('result-meta');
  const metaParts = [
    winner.year ? `📅 ${winner.year}` : null,
    winner.pages ? `📄 ${winner.pages} págs.` : null,
    winner.categories ? `🏷 ${winner.categories}` : null,
  ].filter(Boolean);
  metaEl.textContent = metaParts.join('  ·  ');
  metaEl.style.display = metaParts.length > 0 ? 'block' : 'none';

  // Sinopsis
  const descEl = document.getElementById('result-description');
  if (winner.description) {
    descEl.textContent = winner.description;
    descEl.style.display = 'block';
  } else {
    descEl.style.display = 'none';
  }
}

// =============================================
// ACELERÓMETRO
// =============================================

/**
 * Inicializa el listener del acelerómetro para detectar el gesto de agitar.
 * En dispositivos Android con Capacitor el acelerómetro funciona nativamnete.
 * En navegador de escritorio fallará silenciosamente.
 */
async function initMotion() {
  try {
    await Motion.addListener('accel', (event) => {
      const { x, y, z } = event.accelerationIncludingGravity;
      const fuerza = Math.sqrt(x * x + y * y + z * z);

      if (fuerza > 20 && !animating) {
        const tabRandom = document.getElementById('tab-random');
        if (tabRandom.style.display !== 'none') {
          startShuffle();
        }
      }
    });
  } catch (e) {
    console.log('Motion no disponible:', e);
  }
}

// =============================================
// NAVEGACIÓN ENTRE TABS
// =============================================

/**
 * Cambia la pestaña activa mostrando el contenido correspondiente
 * y actualizando el estado visual de los botones de tab.
 * @param {string} activeTab - ID de la pestaña a mostrar ('tab-list' | 'tab-random' | 'tab-discover')
 */
function switchTab(activeTab) {
  // Ocultamos todas las pantallas
  ['tab-list', 'tab-random', 'tab-discover'].forEach((id) => {
    document.getElementById(id).style.display = 'none';
  });

  // Quitamos la clase active de todos los botones de tab
  ['tab-btn-list', 'tab-btn-random', 'tab-btn-discover'].forEach((id) => {
    document.getElementById(id).classList.remove('active');
  });

  // Mostramos la pestaña seleccionada
  document.getElementById(activeTab).style.display = 'flex';

  // Activamos el botón correspondiente
  const btnMap = {
    'tab-list': 'tab-btn-list',
    'tab-random': 'tab-btn-random',
    'tab-discover': 'tab-btn-discover',
  };
  document.getElementById(btnMap[activeTab]).classList.add('active');
}

// =============================================
// ARRANQUE — VINCULACIÓN DE EVENTOS
// =============================================

// Botón de añadir libro
document.getElementById('add-btn').addEventListener('click', addBook);

// Búsqueda en vivo en el campo de título (debounced)
document.getElementById('input-title').addEventListener('input', onTitleInput);

// Cerrar el dropdown al hacer clic fuera
document.addEventListener('click', (e) => {
  if (!e.target.closest('.add-book')) {
    document.getElementById('suggestions').style.display = 'none';
  }
});

// Tab Mis pendientes
document.getElementById('tab-btn-list').addEventListener('click', () => {
  switchTab('tab-list');
});

// Tab Decídete — inicializa p5 la primera vez
document.getElementById('tab-btn-random').addEventListener('click', () => {
  switchTab('tab-random');
  if (!p5Instance) initP5();
});

// Tab Descubrir
document.getElementById('tab-btn-discover').addEventListener('click', () => {
  switchTab('tab-discover');
});

// Botón de sortear
document.getElementById('shake-btn').addEventListener('click', () => {
  startShuffle();
});

// Buscador de Descubrir: botón y tecla Enter
document.getElementById('discover-btn').addEventListener('click', discoverSearch);
document.getElementById('discover-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') discoverSearch();
});

// Cargamos los libros guardados y activamos el acelerómetro al arrancar
loadBooks();
initMotion();
