import fs from "node:fs/promises";
import path from "node:path";

const manifest = {
  generatedAt: new Date().toISOString(),
  policy: {
    freshness: "daily",
    sourcing: "official-first, media-second",
  },
  demos: {
    opinion: {
      primary: [
        "https://www.commission-des-sondages.fr/notices/",
        "https://www.sciencespo.fr/cevipof/fr/etudes-enquetes/barometre-confiance-politique/",
      ],
      secondary: ["https://www.lemonde.fr/"],
    },
    retail: {
      primary: [
        "https://www.insee.fr/en/statistiques/8597070",
        "https://www.banque-france.fr/fr/publications-et-recherche/nos-principales-publications/enquete-mensuelle-de-conjoncture",
        "https://www.arcep.fr/cartes-et-donnees/nos-publications-chiffrees/barometre-du-numerique/le-barometre-du-numerique-edition-2025.html",
      ],
      secondary: [],
    },
    b2b: {
      primary: [
        "https://www.banque-france.fr/fr/publications-et-recherche/nos-principales-publications/enquete-mensuelle-de-conjoncture",
        "https://www.francenum.gouv.fr/barometre-france-num",
        "https://en.arcep.fr/",
      ],
      secondary: [],
    },
  },
};

const outputPath = path.join(process.cwd(), "src", "data", "source-manifest.generated.json");

await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${outputPath}`);
