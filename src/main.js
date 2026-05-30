import { Motion } from '@capacitor/motion';

// COLORES PARA LOS LOMOS DE LOS LIBROS 
const COLORS = [
  '#c4a8b0', '#b0a0b8', '#d4b8b0', '#a8b0c0',
  '#c8b0a8', '#b8a8c0', '#d0b8c0', '#b0b8c8',
];

// ESTADO GLOBAL 
let books = [];
let winner = null;
let animating = false;
let animFrame = 0;
let cards = [];
let p5Instance = null;

// PERSISTENCIA CON LOCALSTORAGE 

function saveBooks() {
  localStorage.setItem('cualleo_books', JSON.stringify(books));
}

function loadBooks() {
  const value = localStorage.getItem('cualleo_books');
  if (value) {
    books = JSON.parse(value);
  }
  renderList();
}

// GESTIÓN DE LIBROS 

function addBook() {
  const titleInput = document.getElementById('input-title');
  const authorInput = document.getElementById('input-author');
  const title = titleInput.value.trim();
  const author = authorInput.value.trim();

  if (!title) return;

  books.push({
    title,
    author: author || 'autor desconocido',
    color: COLORS[books.length % COLORS.length],
  });

  titleInput.value = '';
  authorInput.value = '';

  saveBooks();
  renderList();

  if (p5Instance) drawIdle(p5Instance);
}

function renderList() {
  const list = document.getElementById('book-list');
  document.getElementById('count').textContent = books.length;

  if (books.length === 0) {
    list.innerHTML = '<div class="empty-state">Tu lista de pendientes está vacía</div>';
    return;
  }

  list.innerHTML = '';

  books.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = 'book-item';

    const dot = document.createElement('div');
    dot.className = 'book-dot';
    dot.style.background = b.color;

    const info = document.createElement('div');
    info.className = 'book-info';
    info.innerHTML = `
      <div class="book-title">${b.title}</div>
      <div class="book-author">${b.author}</div>
    `;

    const del = document.createElement('button');
    del.className = 'book-del';
    del.textContent = '×';
    del.addEventListener('click', () => {
      books.splice(i, 1);
      saveBooks();
      renderList();
      if (p5Instance) drawIdle(p5Instance);
    });

    el.appendChild(dot);
    el.appendChild(info);
    el.appendChild(del);
    list.appendChild(el);
  });
}

// ANIMACIÓN P5.JS 

function initP5() {
  const container = document.getElementById('canvas-container');

  p5Instance = new p5((sketch) => {

    sketch.setup = function () {
      const canvas = sketch.createCanvas(container.offsetWidth, 260);
      canvas.parent('canvas-container');
      sketch.noLoop();
      drawIdle(sketch);
    };

    sketch.draw = function () {
      if (!animating) return;
      animFrame++;

      sketch.background('#2d1245');

      let stillGoing = false;

      cards.forEach((c) => {
        if (c.isWinner && animFrame > 45) return;

        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.45;
        c.vx *= 0.98;
        c.angle += c.va;
        if (!c.isWinner) c.alpha -= 0.022;

        if (c.alpha > 0) {
          drawBook(sketch, c.x, c.y, c.book, c.angle, Math.max(0, c.alpha));
          if (c.alpha > 0.01) stillGoing = true;
        }
      });

      if (animFrame < 65) stillGoing = true;

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

  // Lomo
  sketch.fill(255, 255, 255, 55 * alpha);
  sketch.rect(-bw / 2, -bh / 2, 6, bh, 4);

  // Título en el lomo
  sketch.fill(255, 255, 255, 200 * alpha);
  sketch.textAlign(sketch.CENTER, sketch.CENTER);
  sketch.textSize(7.5);
  sketch.push();
  sketch.rotate(-sketch.HALF_PI);
  const short = book.title.length > 16 ? book.title.substring(0, 15) + '…' : book.title;
  sketch.text(short, 0, 0);
  sketch.pop();

  sketch.pop();
}

// SORTEO 

function startShuffle() {
  if (animating || books.length === 0 || !p5Instance) return;

  document.getElementById('result-card').style.display = 'none';
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

function showResult() {
  const card = document.getElementById('result-card');
  card.style.display = 'block';
  document.getElementById('result-title').textContent = winner.title;
  document.getElementById('result-author').textContent = winner.author;
}

// ACELERÓMETRO ─

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

// ARRANQUE ─────

document.getElementById('add-btn').addEventListener('click', addBook);

document.getElementById('tab-btn-list').addEventListener('click', () => {
  document.getElementById('tab-list').style.display = 'flex';
  document.getElementById('tab-random').style.display = 'none';
  document.getElementById('tab-btn-list').classList.add('active');
  document.getElementById('tab-btn-random').classList.remove('active');
});

document.getElementById('tab-btn-random').addEventListener('click', () => {
  document.getElementById('tab-list').style.display = 'none';
  document.getElementById('tab-random').style.display = 'flex';
  document.getElementById('tab-btn-list').classList.remove('active');
  document.getElementById('tab-btn-random').classList.add('active');
  if (!p5Instance) initP5();
});

document.getElementById('shake-btn').addEventListener('click', () => {
  startShuffle();
});

loadBooks();
initMotion();