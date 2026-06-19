# ¿Cuál leo? — PR2

App móvil con Capacitor + ViteJS + p5.js para gestionar tu lista de libros pendientes y elegir el próximo que vas a leer.

## Novedades PR2

- **Búsqueda en Google Books API** al añadir libros: autocompletado con portada, autor y año real.
- **Tab Descubrir**: busca libros por título, autor o tema y añádelos directamente a tu lista.
- **Portadas reales** en la lista de pendientes, en el canvas p5.js y en la tarjeta de resultado del sorteo.
- **Sinopsis y metadatos** (año, páginas, categoría) del libro ganador tras el sorteo.

## Funcionalidades nativas

- **Acelerómetro** (`@capacitor/motion`): agitar el móvil inicia el sorteo.
- **LocalStorage** (`@capacitor/preferences`): persistencia local de la lista de libros.

## Stack tecnológico

- Capacitor 8
- ViteJS 8
- p5.js 1.9.4
- Google Books API v1

## Instalación y ejecución

```bash
npm install
npm run build
npx cap sync android
npx cap open android
```

## APIKey

La clave de Google Books API se entrega en archivo separado `api-key.txt`.  

## Terminal de pruebas

Probado en: Emulador Pixel 8 con Android 15 (API 37.0)

## Licencia

MIT
