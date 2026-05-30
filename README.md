# ¿Cuál leo?

App móvil para decidir tu próxima lectura pendiente.

## ¿Qué es?

Randomizador de libros pendientes desarrollado con Capacitor + Vite + p5.js para Android. Añades los libros que tienes pendientes, agitas el móvil o pulsas el botón y la app elige uno por ti con una animación generativa de libros cayendo.

## Funcionalidades

- Añadir y eliminar libros de tu lista de pendientes
- Animación generativa de libros en p5.js
- Sorteo aleatorio con animación de libros cayendo
- Agitar el móvil para sortear (acelerómetro)
- Persistencia de datos con LocalStorage

## Stack tecnológico

- Capacitor
- Vite
- p5.js
- JavaScript vanilla

## Cómo ejecutar

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

Probado en emulador Pixel 8 API 37.

## Licencia

MIT
