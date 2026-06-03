import type {
  CompetitorFact,
  EventBrief,
  MarketFact,
  Persona,
  QuestionBankEntry,
  Scenario,
  SourceReference,
} from "../types";

export const sourceReferences: SourceReference[] = [
  {
    id: "src-commission-transport",
    title: "Notice de sondage sur la gratuité partielle des transports publics",
    publisher: "Commission des sondages",
    url: "https://www.commission-des-sondages.fr/notices/",
    publishedAt: "2026-05-27",
    kind: "pollster",
    geography: "France",
    summary:
      "Notice filing exposing the full wording of a recent transport-cost opinion question and its fieldwork context.",
    snippet:
      "Includes question text, field dates, sample size, and margin-of-error disclosure for public consultation.",
    tags: ["transport", "purchasing_power", "public_opinion"],
    affectedSegments: ["commuters", "urban households", "students"],
    confidence: 0.91,
  },
  {
    id: "src-cevipof-trust",
    title: "Baromètre de la confiance politique 2026",
    publisher: "CEVIPOF",
    url: "https://www.sciencespo.fr/cevipof/fr/etudes-enquetes/barometre-confiance-politique/",
    publishedAt: "2026-02-15",
    kind: "institution",
    geography: "France",
    summary:
      "Reference political-trust wave tracking institutional confidence, direct-democracy demand, and decentralization sentiment.",
    snippet:
      "Recent wave shows very high distrust in politics while local proximity remains more resilient.",
    tags: ["trust", "democracy", "institutions", "decentralization"],
    affectedSegments: ["older voters", "rural households", "public sector workers"],
    confidence: 0.95,
  },
  {
    id: "src-insee-confidence",
    title: "Household consumer confidence remains sluggish",
    publisher: "INSEE",
    url: "https://www.insee.fr/en/statistiques/8597070",
    publishedAt: "2025-06-27",
    kind: "institution",
    geography: "France",
    summary:
      "Monthly consumer confidence signal covering living standards, future finances, and major purchases.",
    snippet:
      "Households remain cautious on personal finances and large purchases despite relative stability in the headline indicator.",
    tags: ["consumer_confidence", "inflation", "major_purchases"],
    affectedSegments: ["families", "low-income households", "first-time buyers"],
    confidence: 0.94,
  },
  {
    id: "src-bdf-conjoncture",
    title: "Enquête mensuelle de conjoncture",
    publisher: "Banque de France",
    url: "https://www.banque-france.fr/fr/publications-et-recherche/nos-principales-publications/enquete-mensuelle-de-conjoncture",
    publishedAt: "2026-05-09",
    kind: "institution",
    geography: "France",
    summary:
      "Business climate pulse based on responses from about 8,500 business leaders across industry, services, and construction.",
    snippet:
      "Managers report mixed activity, selective investment appetite, and ongoing cost-control pressure.",
    tags: ["business_climate", "cost_control", "investment", "SMB"],
    affectedSegments: ["SMEs", "industrial buyers", "service operators"],
    confidence: 0.95,
  },
  {
    id: "src-arcep-barometer",
    title: "Baromètre du numérique 2025",
    publisher: "Arcep / CREDOC",
    url: "https://www.arcep.fr/cartes-et-donnees/nos-publications-chiffrees/barometre-du-numerique/le-barometre-du-numerique-edition-2025.html",
    publishedAt: "2025-03-19",
    kind: "institution",
    geography: "France",
    summary:
      "Annual study on digital equipment, behaviors, and AI usage among French residents.",
    snippet:
      "Screens occupy roughly a quarter of personal waking time and AI has emerged as a major new behavior dimension.",
    tags: ["digital_usage", "AI", "equipment", "consumer_tech"],
    affectedSegments: ["young adults", "remote workers", "SMB owners"],
    confidence: 0.92,
  },
  {
    id: "src-france-num-ai",
    title: "Baromètre France Num 2025",
    publisher: "France Num",
    url: "https://www.francenum.gouv.fr/barometre-france-num",
    publishedAt: "2025-09-15",
    kind: "institution",
    geography: "France",
    summary:
      "Tracks digital maturity, AI use, cybersecurity, and e-invoicing readiness across French TPE/PME.",
    snippet:
      "Many TPE/PME see digital value, but adoption remains uneven and compliance deadlines concentrate attention.",
    tags: ["SMB_digitization", "AI", "e-invoicing", "cyber"],
    affectedSegments: ["small business owners", "finance leads", "operations managers"],
    confidence: 0.93,
  },
  {
    id: "src-lemonde-agenda",
    title: "French political agenda watch",
    publisher: "Le Monde",
    url: "https://www.lemonde.fr/",
    publishedAt: "2026-05-31",
    kind: "media",
    geography: "France",
    summary:
      "Agenda-setting coverage around transport strikes, purchasing-power anxiety, and local public-service friction.",
    snippet:
      "Recent reporting suggests cost-of-living and mobility questions are crowding out abstract institutional debates.",
    tags: ["agenda_salience", "transport", "purchasing_power"],
    affectedSegments: ["urban commuters", "peri-urban households"],
    confidence: 0.71,
  },
];

export const eventBriefs: EventBrief[] = [
  {
    id: "brief-transport",
    title: "Mobility costs are crowding public attention",
    summary:
      "Transport pricing and commuting strain have become a vivid way to talk about purchasing power, fairness, and local service quality.",
    demo: "opinion",
    tags: ["transport", "purchasing_power"],
    freshness: "updated today",
    sourceIds: ["src-commission-transport", "src-lemonde-agenda"],
  },
  {
    id: "brief-trust",
    title: "Demand for proximity and democratic reset",
    summary:
      "Institutional distrust remains elevated, but local decision-making and direct participation retain stronger appeal.",
    demo: "opinion",
    tags: ["trust", "democracy"],
    freshness: "updated this week",
    sourceIds: ["src-cevipof-trust"],
  },
  {
    id: "brief-retail",
    title: "Households are value-sensitive but digitally reachable",
    summary:
      "Consumer confidence remains soft while digital habits stay strong, creating a market where convenience must justify spend.",
    demo: "retail",
    tags: ["consumer_confidence", "AI", "major_purchases"],
    freshness: "updated this week",
    sourceIds: ["src-insee-confidence", "src-arcep-barometer"],
  },
  {
    id: "brief-b2b",
    title: "SMBs are under pressure to modernize selectively",
    summary:
      "Buyers feel both compliance pressure and budget caution, making low-risk ROI narratives more credible than transformation rhetoric.",
    demo: "b2b",
    tags: ["SMB_digitization", "cost_control", "e-invoicing"],
    freshness: "updated today",
    sourceIds: ["src-bdf-conjoncture", "src-france-num-ai"],
  },
];

export const questionBank: QuestionBankEntry[] = [
  {
    id: "q-op-transport",
    demo: "opinion",
    theme: "transport",
    canonicalQuestion:
      "Would you support a public policy that caps public-transport fare increases if it required reallocation from other local spending?",
    normalizedTemplate:
      "Assess support or opposition to a proposed policy, explicitly weighing personal convenience, fairness, and budget tradeoffs.",
    answerMode: "support_oppose",
    sourceIds: ["src-commission-transport", "src-cevipof-trust"],
  },
  {
    id: "q-retail-subscription",
    demo: "retail",
    theme: "consumer_launch",
    canonicalQuestion:
      "How likely would you be to adopt a premium household subscription that saves time but raises your monthly fixed spending?",
    normalizedTemplate:
      "Assess adoption intent and willingness to pay by balancing value, necessity, trust, and economic pressure.",
    answerMode: "adoption_intent",
    sourceIds: ["src-insee-confidence", "src-arcep-barometer"],
  },
  {
    id: "q-b2b-automation",
    demo: "b2b",
    theme: "b2b_software",
    canonicalQuestion:
      "How likely is your buying committee to approve an AI-assisted back-office automation platform within the next two quarters?",
    normalizedTemplate:
      "Assess buying-committee dynamics using urgency, ROI, integration risk, compliance, and sponsor/blocker roles.",
    answerMode: "buying_committee",
    sourceIds: ["src-bdf-conjoncture", "src-france-num-ai"],
  },
];

export const marketFacts: MarketFact[] = [
  {
    id: "mf-retail-confidence",
    demo: "retail",
    fact: "Consumer caution means convenience claims need a sharp economic payoff, not just novelty.",
    signal: "headwind",
    sourceIds: ["src-insee-confidence"],
  },
  {
    id: "mf-retail-digital",
    demo: "retail",
    fact: "Digital reach remains strong, so channel familiarity can offset some reluctance.",
    signal: "tailwind",
    sourceIds: ["src-arcep-barometer"],
  },
  {
    id: "mf-b2b-budget",
    demo: "b2b",
    fact: "French SMEs remain cost-conscious, pushing vendors toward staged rollouts and near-term ROI framing.",
    signal: "headwind",
    sourceIds: ["src-bdf-conjoncture"],
  },
  {
    id: "mf-b2b-compliance",
    demo: "b2b",
    fact: "E-invoicing and digitization obligations create a credible trigger for back-office software adoption.",
    signal: "tailwind",
    sourceIds: ["src-france-num-ai"],
  },
];

export const competitorFacts: CompetitorFact[] = [
  {
    id: "cf-retail",
    category: "Subscription commerce",
    insight:
      "Incumbents over-index on convenience and under-explain budget certainty, leaving space for transparent savings positioning.",
    sourceIds: ["src-insee-confidence", "src-arcep-barometer"],
  },
  {
    id: "cf-b2b",
    category: "Back-office automation",
    insight:
      "Existing tools are seen as fragmented and risky to integrate, which makes proof-of-control messaging more persuasive than AI futurism.",
    sourceIds: ["src-bdf-conjoncture", "src-france-num-ai"],
  },
];

export const personas: Persona[] = [
  {
    id: "p-1",
    name: "Epse Janiak",
    age: 39,
    city: "Bruay-la-Buissière",
    region: "Hauts-de-France",
    occupation: "Industrial maintenance technician",
    household: "Couple with children",
    economicPosture: "Budget-constrained but duty-driven",
    traits: ["methodical", "community-minded", "skeptical of lofty promises"],
    concerns: ["transport cost", "household bills", "local public services"],
  },
  {
    id: "p-2",
    name: "Lina Bensaïd",
    age: 27,
    city: "Lyon",
    region: "Auvergne-Rhone-Alpes",
    occupation: "Product designer",
    household: "Single renter",
    economicPosture: "Digitally fluent, value-sensitive",
    traits: ["curious", "eco-aware", "fast-switching"],
    concerns: ["subscription fatigue", "urban mobility", "ethical brands"],
  },
  {
    id: "p-3",
    name: "Jean-Baptiste Rolland",
    age: 51,
    city: "Tours",
    region: "Centre-Val de Loire",
    occupation: "SME finance director",
    household: "Couple without children at home",
    economicPosture: "Risk-managed spender",
    traits: ["cautious", "ROI-driven", "process-oriented"],
    concerns: ["compliance", "margin pressure", "vendor lock-in"],
  },
  {
    id: "p-4",
    name: "Mélissa Courtin",
    age: 33,
    city: "Toulouse",
    region: "Occitanie",
    occupation: "Nurse",
    household: "Single parent",
    economicPosture: "Time-poor and price-aware",
    traits: ["pragmatic", "service-focused", "emotionally taxed"],
    concerns: ["service reliability", "healthcare strain", "daily logistics"],
  },
  {
    id: "p-5",
    name: "Sofiane Mebarki",
    age: 44,
    city: "Marseille",
    region: "Provence-Alpes-Cote d'Azur",
    occupation: "Restaurant owner",
    household: "Family household",
    economicPosture: "Growth-seeking under pressure",
    traits: ["resilient", "people-reading", "allergic to bureaucracy"],
    concerns: ["cash flow", "digital admin burden", "staffing"],
  },
];

export const scenarios: Scenario[] = [
  {
    id: "sc-opinion",
    demo: "opinion",
    title: "Transport Fare Shield",
    description:
      "Simulate reaction to a French local policy that caps public-transport fare increases by reprioritizing municipal budgets.",
    tags: ["transport", "purchasing_power", "local_politics"],
    targetSegments: ["urban commuters", "families", "public-sector workers"],
    questionBankId: "q-op-transport",
  },
  {
    id: "sc-retail",
    demo: "retail",
    title: "Household Efficiency Pass",
    description:
      "Forecast uptake for a premium subscription bundle that combines delivery, repair, and energy-saving benefits.",
    tags: ["subscription", "value", "consumer"],
    targetSegments: ["busy families", "urban renters", "digitally engaged adults"],
    questionBankId: "q-retail-subscription",
  },
  {
    id: "sc-b2b",
    demo: "b2b",
    title: "AI Back-Office Pilot",
    description:
      "Stress-test a software purchase for SME back-office automation under cost-control and compliance pressure.",
    tags: ["SMB", "AI", "compliance"],
    targetSegments: ["finance leads", "ops managers", "owners"],
    questionBankId: "q-b2b-automation",
  },
];
