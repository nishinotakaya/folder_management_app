// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';
// import fs from 'fs';

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     https: {
//       key: fs.readFileSync('./key.pem'),
//       cert: fs.readFileSync('./cert.pem'),
//     },
//     port: 5173,
//     host: 'localhost',
//   },
// });

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.ttf'],
  server: {
    port: 5173, // ポートはそのまま
    host: 'localhost', // ホストもそのまま
  },
});
