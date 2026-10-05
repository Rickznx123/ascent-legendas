import path from "node:path";
import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

// A tela da interface. Em desenvolvimento roda dentro do servidor (npm run app);
// "npm run app:montar" gera app/web/dist para o modo produção e para o Electron.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
  },
});
