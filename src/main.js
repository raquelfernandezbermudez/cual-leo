// Plugin de Capacitor para acceder al acelerómetro del dispositivo
import { Motion } from '@capacitor/motion';

// Paleta de colores para los lomos de los libros en el canvas
// Tonos nude y malva apagado para mantener coherencia con la estética de la app
const COLORS = [
  '#c4a8b0', '#b0a0b8', '#d4b8b0', '#a8b0c0',
  '#c8b0a8', '#b8a8c0', '#d0b8c0', '#b0b8c8',
];

// ESTADO GLOBAL 
let books = [];       // Array de libros pendientes del usuario
let winner = null;    // Libro ganador del último sorteo
let animating = false; // Controla si la animación de sorteo está en curso
let animFrame = 0;    // Contador de frames para controlar la duración de la animación
let cards = [];       // Copia de los libros con propiedades físicas para la animación
let p5Instance = null; // Referencia a la instancia de p5.js (se crea al abrir la pestaña de sorteo)

// PERSISTENCIA CON LOCALSTORAGE 

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

// GESTIÓN DE LIBROS 

// Añade un nuevo libro al array, lo guarda y actualiza la vista
function addBook() {
  const titleInput = document.getElementById('input-title');
  const authorInput = document.getElementById('input-author');
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  // Si no hay título no hacemos nada
  if (!title) return;

  // Añadimos el libro con un color asignado cíclicamente de la paleta
  books.push({
    title,
    author: author || 'autor desconocido',
    color: COLORS[books.length % COLORS.length],
  });

  // Limpiamos los inputs
  titleInput.value = '';
  authorInput.value = '';

  saveBooks();
  renderList();

  // Si el canvas de p5 ya está inicializado, lo actualizamos con el nuevo libro
  if (p5Instance) drawIdle(p5Instance);
}

// Renderiza la lista de libros en el DOM
// Usamos createElement en lugar de innerHTML para evitar problemas con el scope de módulos ES
function renderList() {
  const list = document.getElementById('book-list');
  document.getElementById('count').textContent = books.length;

  // Si no hay libros mostramos el estado vacío
  if (books.length === 0) {
    list.innerHTML = '<div class="empty-state">Tu lista de pendientes está vacía</div>';
    return;
  }

  list.innerHTML = '';

  // Creamos un elemento por cada libro
  books.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = 'book-item';

    // Punto de color identificativo del libro
    const dot = document.createElement('div');
    dot.className = 'book-dot';
    dot.style.background = b.color;

    // Título y autor
    const info = document.createElement('div');
    info.className = 'book-info';
    info.innerHTML = `
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
    `;

    // Botón de borrar — usamos addEventListener para que funcione dentro de módulos ES
    const del = document.createElement('button');
    del.className = 'book-del';
    del.textContent = '×';
    del.addEventListener('click', () => {
      books.splice(i, 1); // Eliminamos el libro por índice
      saveBooks();
      renderList();
      if (p5Instance) drawIdle(p5Instance); // Actualizamos el canvas
    });

    el.appendChild(dot);
    el.appendChild(info);
    el.appendChild(del);
    list.appendChild(el);
  });
}

// ANIMACIÓN P5.JS 

// Inicializa la instancia de p5.js en modo instancia para evitar conflictos con módulos ES
// Se llama la primera vez que el usuario abre la pestaña de sorteo
function initP5() {
  const container = document.getElementById('canvas-container');

  p5Instance = new p5((sketch) => {

    // setup() se ejecuta una sola vez al iniciar el sketch
    sketch.setup = function () {
      // Creamos el canvas con el ancho del contenedor y altura fija
      const canvas = sketch.createCanvas(container.offsetWidth, 260);
      canvas.parent('canvas-container');
      sketch.noLoop(); // El canvas no se redibuja continuamente, solo cuando es necesario
      drawIdle(sketch); // Dibujamos el estado inicial con los libros apilados
    };

    // draw() se ejecuta en bucle mientras p5 está en loop (solo durante la animación)
    sketch.draw = function () {
      if (!animating) return;
      animFrame++;

      sketch.background('#2d1245');

      let stillGoing = false;

      // Actualizamos la física de cada carta/libro
      cards.forEach((c) => {
        // El ganador se detiene en el centro a partir del frame 45
        if (c.isWinner && animFrame > 45) return;

        // Aplicamos física: posición, gravedad, fricción y rotación
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

      // Mantenemos la animación al menos 65 frames para que se vea completa
      if (animFrame < 65) stillGoing = true;

      // Cuando la animación termina mostramos el ganador y el resultado
      if (!stillGoing) {
        animating = false;
        sketch.noLoop();
        sketch.background('#2d1245');
        drawBook(sketch, sketch.width / 2, sketch.height / 2, winner, 0, 1);
        showResult();
      }
    };
  });
}

// Dibuja los libros apilados en el canvas en estado de reposo
function drawIdle(sketch) {
  sketch.background('#2d1245');

  // Si no hay libros mostramos un mensaje
  if (books.length === 0) {
    sketch.fill('rgba(201,160,232,0.4)');
    sketch.noStroke();
    sketch.textAlign(sketch.CENTER, sketch.CENTER);
    sketch.textSize(13);
    sketch.text('Añade libros para elegir', sketch.width / 2, sketch.height / 2);
    return;
  }

  const bw = 36, bh = 105; // Dimensiones de cada libro en píxeles
  const total = Math.min(books.length, 8); // Mostramos máximo 8 libros en el canvas
  // Calculamos el punto de inicio para centrar la pila horizontalmente
  const startX = sketch.width / 2 - (total * (bw + 8)) / 2 + bw / 2;

  for (let i = 0; i < total; i++) {
    const x = startX + i * (bw + 8);
    // Ligera variación vertical con seno para dar sensación de pila orgánica
    const y = sketch.height / 2 + Math.sin(i * 0.9) * 5;
    // Alternamos la inclinación para simular una pila real
    const angle = (i % 2 === 0 ? 1 : -1) * 0.03;
    drawBook(sketch, x, y, books[i % books.length], angle, 1);
  }
}

// Dibuja un libro individual en el canvas con sus propiedades visuales
function drawBook(sketch, x, y, book, angle, alpha) {
  const bw = 36, bh = 105;
  sketch.push(); // Guardamos el estado de transformación actual
  sketch.translate(x, y);
  sketch.rotate(angle);

  // Sombra desplazada para dar sensación de profundidad
  sketch.noStroke();
  sketch.fill(0, 0, 0, 40 * alpha);
  sketch.rect(-bw / 2 + 3, -bh / 2 + 3, bw, bh, 8);

  // Cuerpo principal del libro con el color asignado
  const c = sketch.color(book.color);
  c.setAlpha(alpha * 255); // Aplicamos transparencia para el efecto de desvanecimiento
  sketch.fill(c);
  sketch.rect(-bw / 2, -bh / 2, bw, bh, 8);

  // Reflejo en el lomo izquierdo para simular encuadernación
  sketch.fill(255, 255, 255, 55 * alpha);
  sketch.rect(-bw / 2, -bh / 2, 6, bh, 4);

  // Título del libro escrito verticalmente en el lomo
  sketch.fill(255, 255, 255, 200 * alpha);
  sketch.textAlign(sketch.CENTER, sketch.CENTER);
  sketch.textSize(7.5);
  sketch.push();
  sketch.rotate(-sketch.HALF_PI); // Rotamos 90° para escribir en vertical
  // Truncamos el título si es demasiado largo para el lomo
  const short = book.title.length > 16 ? book.title.substring(0, 15) + '…' : book.title;
  sketch.text(short, 0, 0);
  sketch.pop();

  sketch.pop(); // Restauramos el estado de transformación
}

// SORTEO 

// Inicia la animación de sorteo
function startShuffle() {
  // Evitamos iniciar si ya hay una animación en curso, no hay libros o p5 no está listo
  if (animating || books.length === 0 || !p5Instance) return;

  document.getElementById('result-card').style.display = 'none';

  // Seleccionamos el ganador aleatoriamente
  winner = books[Math.floor(Math.random() * books.length)];
  animating = true;
  animFrame = 0;

  // Creamos las cartas con propiedades físicas aleatorias para la animación
  cards = books.map((b) => ({
    book: b,
    x: p5Instance.width / 2,   // Todas empiezan en el centro
    y: p5Instance.height / 2,
    vx: (Math.random() - 0.5) * 12,  // Velocidad horizontal aleatoria
    vy: -Math.random() * 9 - 3,       // Velocidad vertical hacia arriba
    angle: (Math.random() - 0.5) * 0.2, // Ángulo inicial aleatorio
    va: (Math.random() - 0.5) * 0.12,   // Velocidad angular aleatoria
    alpha: 1,
    isWinner: b === winner, // Marcamos el ganador para tratarlo diferente
  }));

  p5Instance.loop(); // Activamos el bucle de dibujo de p5
}

// Muestra la tarjeta de resultado con el libro ganador
function showResult() {
  const card = document.getElementById('result-card');
  card.style.display = 'block';
  document.getElementById('result-title').textContent = winner.title;
  document.getElementById('result-author').textContent = winner.author;
}

// ACELERÓMETRO 

// Inicializa el listener del acelerómetro para detectar el gesto de agitar
async function initMotion() {
  try {
    await Motion.addListener('accel', (event) => {
      const { x, y, z } = event.accelerationIncludingGravity;
      // Calculamos la fuerza total como módulo del vector de aceleración
      const fuerza = Math.sqrt(x * x + y * y + z * z);

      // Si la fuerza supera el umbral y la pestaña de sorteo está visible, lanzamos el sorteo
      if (fuerza > 20 && !animating) {
        const tabRandom = document.getElementById('tab-random');
        if (tabRandom.style.display !== 'none') {
          startShuffle();
        }
      }
    });
  } catch (e) {
    // En navegador de escritorio el acelerómetro no está disponible — fallamos silenciosamente
    console.log('Motion no disponible:', e);
  }
}

// ARRANQUE 
// Vinculamos todos los eventos con addEventListener en lugar de onclick en el HTML
// Esto es necesario porque el JS se carga como módulo ES y no tiene acceso al scope global

// Botón de añadir libro
document.getElementById('add-btn').addEventListener('click', addBook);

// Tab de lista de pendientes
document.getElementById('tab-btn-list').addEventListener('click', () => {
  document.getElementById('tab-list').style.display = 'flex';
  document.getElementById('tab-random').style.display = 'none';
  document.getElementById('tab-btn-list').classList.add('active');
  document.getElementById('tab-btn-random').classList.remove('active');
});

// Tab de sorteo — inicializa p5 la primera vez que se abre
document.getElementById('tab-btn-random').addEventListener('click', () => {
  document.getElementById('tab-list').style.display = 'none';
  document.getElementById('tab-random').style.display = 'flex';
  document.getElementById('tab-btn-list').classList.remove('active');
  document.getElementById('tab-btn-random').classList.add('active');
  if (!p5Instance) initP5(); // Solo inicializamos p5 una vez
});

// Botón de sortear
document.getElementById('shake-btn').addEventListener('click', () => {
  startShuffle();
});

// Cargamos los libros guardados y activamos el acelerómetro al arrancar
loadBooks();
initMotion();