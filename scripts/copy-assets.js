// Dipanggil `npm run build` setelah tsc.
// tsc tidak menyalin file .json, padahal credential service account di-require
// dari dist/services/** saat runtime. Tanpa langkah ini worker gagal MODULE_NOT_FOUND
// atau memakai credential lama yang tertinggal di dist.
// Isi file tidak pernah dicetak, hanya jumlahnya.
const fs = require("fs");
const path = require("path");

const SRC = path.resolve(__dirname, "..", "src", "services");
const DEST = path.resolve(__dirname, "..", "dist", "services");

function copyJson(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += copyJson(from);
    } else if (entry.name.endsWith(".json")) {
      const to = path.join(DEST, path.relative(SRC, from));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      count++;
    }
  }
  return count;
}

const total = copyJson(SRC);
if (total === 0) {
  // credential tidak ada di git, jadi folder baru di server bisa kosong
  console.error("[build] tidak ada credential *.json di src/services - salin manual dulu");
  process.exit(1);
}
console.log(`[build] ${total} credential *.json disalin ke dist/services`);
