// Junta os dois builds: site em dist/ e sistema em dist/app/
import { cpSync, existsSync, rmSync } from "node:fs";

const out = "dist";
if (!existsSync("site/dist/index.html") || !existsSync("app/dist/index.html")) {
  console.error("Falta o build do site ou do app");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync("site/dist", out, { recursive: true });
cpSync("app/dist", `${out}/app`, { recursive: true });
console.log("dist/ pronto: site na raiz, sistema em /app");
