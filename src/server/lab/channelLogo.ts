const COMMONS_FILE_PATH = "https://commons.wikimedia.org/wiki/Special:FilePath";

const CHANNEL_LOGO_FILES: Record<string, string> = {
  tf1: "Logo TF1 2013.svg",
  "france 2": "France_2_-_logo_2018.svg",
  "france 3": "France 3 - Logo 2018.svg",
  "france 4": "France 4 - Logo 2018.svg",
  "france 5": "France 5 - Logo 2018.svg",
  m6: "Logo M6 (2020, fond clair).svg",
  "canal+": "Logo Canal+ 1995.svg",
  arte: "Arte Logo 2026.svg",
  tmc: "TMC logo.svg",
  tfx: "TFX logo.svg",
  "tf1 series films": "TF1 Séries Films.svg",
  w9: "W9 2018.svg",
  "6ter": "6ter.png",
  gulli: "Logo Gulli 2023.svg",
  c8: "C8 TV logo.svg",
  cstar: "Cstar-logo.jpg",
  "rmc decouverte": "RMC Découverte logo 2025.svg",
  "rmc story": "RMC Story 2025.svg",
  "bfm tv": "BFMTV 2025.svg",
  lci: "La Chaîne Info (logo).svg",
  cnews: "Canal News logo.svg",
  franceinfo: "Franceinfo.svg",
  "l'equipe": "L'Équipe wordmark.svg",
  "nrj 12": "NRJ12 logo 2015.svg",
  "cherie 25": "RMC Life logo 2025.svg",
};

function normalizeChannelName(channelName: string): string {
  return channelName
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\+\s*/g, "+");
}

export function getChannelLogoUrl(channelName: string): string | undefined {
  if (!channelName) return undefined;

  const normalized = normalizeChannelName(channelName);

  const fileName = CHANNEL_LOGO_FILES[normalized];
  if (!fileName) {
    return undefined;
  }

  return `${COMMONS_FILE_PATH}/${encodeURIComponent(fileName)}`;
}
