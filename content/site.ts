/** Site-wide copy. Project records live in `content/projects/`. */

import type { Project } from "@/content/schema";

export const studio = {
  name: "Atrium",
  location: "Tromsø, Noruega",
  email: "studio@atrium.example",
  founded: 2014,
  /** The one-line description: the site's meta description and the Threshold's line. */
  description: "A Atrium é um estúdio de arquitetura em Tromsø, na Noruega, que projeta casas para terrenos do Ártico.",
  /** The Studio Depth's display statement, and the home page description. */
  statement:
    "A Atrium projeta casas a partir do chão do norte, da luz do inverno e do tempo que vem do mar.",
  paragraphs: [
    "O estúdio foi fundado em Tromsø, em 2014. Nossas quatro casas concluídas ficam entre Troms e Nordland, junto à água e ao tempo aberto.",
    "Começamos pelo terreno. Os acúmulos de neve, a direção do vento e a trajetória baixa do sol definem o corte antes de os ambientes ganharem forma.",
    "O concreto sustenta as casas, a pedra as ancora e a madeira reveste as partes abrigadas. O vidro transparente abre os ambientes principais para a água; as cortinas fecham o resto.",
  ],
} as const;

/** A detail crop cut from one of a Project's images. */
type Crop = {
  project: string;
  image: keyof Project["images"];
  /** CSS object-position of the crop within the image. */
  focus: string;
};

/** The Approach Depth's rows, in order. */
export const approach: { label: string; head: string; paragraph: string; crop: Crop }[] = [
  {
    label: "Terreno",
    head: "Deixe o terreno definir o corte.",
    paragraph:
      "Cada casa encontra a encosta sobre um plinto. Muros baixos, caminhos e degraus levam o mesmo nível para dentro da neve e abrigam o chão ao lado dos ambientes.",
    crop: { project: "lyngen", image: "site", focus: "50% 75%" },
  },
  {
    label: "Luz",
    head: "Abra os ambientes à luz do inverno.",
    paragraph:
      "O sol baixo chega por baixo das lajes da cobertura. Na hora azul, o vidro transparente revela o ambiente principal, enquanto as cortinas transformam as outras janelas numa luz mais suave.",
    crop: { project: "senja", image: "light", focus: "50% 70%" },
  },
  {
    label: "Material",
    head: "Construa com uma paleta enxuta.",
    paragraph:
      "O concreto aparente de fôrma de tábuas sustenta os volumes. A pedra marca a lareira, a chaminé ou o chão, e a madeira aquece os forros sob bordas de metal escuro.",
    crop: { project: "kvaloya", image: "material", focus: "50% 60%" },
  },
];

export const contact = {
  line: "Conte-nos sobre o seu terreno no norte.",
} as const;

/** The home page Depths the header links to, in page order. */
export const depths = [
  { id: "projects", label: "Projetos", depth: -1 },
  { id: "studio", label: "Estúdio", depth: -2 },
  { id: "approach", label: "Abordagem", depth: -3 },
  { id: "contact", label: "Contato", depth: -4 },
] as const;

export const footer = {
  line: "A Atrium é um estúdio fictício.",
} as const;

export const notFound = {
  line: "Nada foi construído aqui.",
  link: "Ver os projetos",
} as const;
