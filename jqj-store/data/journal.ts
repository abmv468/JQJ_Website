export const JOURNAL_CATEGORIES = [
  { slug: "all", label: "All" },
  { slug: "care", label: "Care" },
  { slug: "stones", label: "Stones" },
  { slug: "gifting", label: "Gifting" },
  { slug: "dressing", label: "Dressing" },
  { slug: "meaning", label: "Meaning" },
  { slug: "history", label: "History" },
] as const;

export type JournalCategory = Exclude<(typeof JOURNAL_CATEGORIES)[number]["slug"], "all">;

export type JournalCatalogueCategory = JournalCategory | "all" | "unknown";

export type JournalBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: readonly string[] }
  | { type: "quote"; text: string };

export type JournalRelatedLink = {
  label: string;
  href: string;
};

export type JournalStill = {
  src: string;
  alt: string;
};

export type JournalPost = {
  slug: string;
  title: string;
  displayDate: string;
  dateTime: string;
  category: JournalCategory;
  dek: string;
  still: JournalStill;
  metaTitle: string;
  metaDescription: string;
  related: readonly JournalRelatedLink[];
  body?: readonly JournalBlock[];
};

export const JOURNAL_INTRO = {
  eyebrow: "Journal",
  title: "Journal",
  dek: "Notes on natural stone, care, and dressing pieces for everyday ritual.",
} as const;

export const JOURNAL_POSTS: readonly JournalPost[] = [
  {
    slug: "how-to-clean-a-crystal",
    title: "How to clean a crystal without damaging it",
    displayDate: "12 November 2026",
    dateTime: "2026-11-12",
    category: "care",
    dek: "A gentle approach begins with knowing what the stone can tolerate. Not every crystal belongs in water.",
    still: {
      src: "/journal/how-to-clean-a-crystal.webp",
      alt: "A polished natural-stone beaded bracelet on a folded soft cloth, with a dry brush at the edge, on a warm cream surface.",
    },
    metaTitle: "How to clean a crystal without damage | Jewellery Quintessential",
    metaDescription:
      "A gentle approach begins with knowing what the stone can tolerate. Not every crystal belongs in water, and a soft, dry cloth is often enough.",
    related: [
      { label: "Care", href: "https://jqd.app/care" },
      { label: "Amethyst Bracelet XV", href: "https://jqd.app/products/amethyst-bracelet-xv" },
    ],
    body: [
      {
        type: "paragraph",
        text: "A crystal can collect dust, fingerprints, skin oils and traces of everyday wear. Cleaning it does not need special solutions or elaborate rituals. In most cases, a soft cloth and a little patience are enough.",
      },
      {
        type: "paragraph",
        text: "Crystals are not all alike. Some are relatively resistant to water and gentle cleaning, while others can be scratched, stained, weakened or altered by moisture. The safest approach is to begin with the least intervention possible.",
      },
      { type: "heading", text: "Start with a dry clean" },
      {
        type: "paragraph",
        text: "For routine cleaning, use a clean, soft microfibre cloth. Gently wipe the surface, turning the cloth as necessary to avoid moving accumulated dust across the stone.",
      },
      {
        type: "paragraph",
        text: "A soft, dry brush can help reach small spaces around settings, bead holes and decorative details. Use light pressure. Avoid stiff brushes, paper towels and abrasive cloths, which can leave fine scratches on softer stones or polished metal.",
      },
      {
        type: "paragraph",
        text: "If the jewellery has accumulated loose dust rather than stubborn residue, a dry clean is usually sufficient.",
      },
      { type: "heading", text: "When water is appropriate" },
      {
        type: "paragraph",
        text: "Some stones can tolerate brief contact with lukewarm water. Quartz varieties, including clear quartz, amethyst and many varieties of agate, are generally more suitable for gentle water cleaning than porous, water-sensitive or structurally delicate materials.",
      },
      {
        type: "paragraph",
        text: "Even so, a stone's suitability does not automatically make the entire piece washable. Jewellery may include metal findings, adhesives, coatings, stringing materials or components that react differently to moisture.",
      },
      {
        type: "paragraph",
        text: "If you know the stone and construction are water-safe, lightly dampen a soft cloth with clean lukewarm water and wipe the surface. Do not soak the jewellery. Dry it immediately with another soft cloth, paying attention to crevices and areas around metal components.",
      },
      {
        type: "paragraph",
        text: "When the material is uncertain, stay with dry cleaning.",
      },
      { type: "heading", text: "What to avoid" },
      {
        type: "paragraph",
        text: "A number of familiar household cleaning methods are unnecessarily harsh for gemstone jewellery.",
      },
      { type: "paragraph", text: "Avoid:" },
      {
        type: "list",
        items: [
          "Bleach, vinegar and acidic household cleaners.",
          "Alcohol-based cleaning products unless specifically confirmed safe for every component.",
          "Abrasive powders and polishing compounds.",
          "Ultrasonic cleaners, particularly for stones with inclusions, fractures, treatments or delicate settings.",
          "Steam cleaning and sudden temperature changes.",
          "Long periods of soaking, especially where stringing, adhesives or metal fittings are involved.",
        ],
      },
      {
        type: "paragraph",
        text: "Ultrasonic cleaning deserves particular caution. The vibration can aggravate existing internal fractures or loosen components. A stone that looks solid from the outside may contain natural features that make this method unsuitable.",
      },
      { type: "heading", text: "Give each material its own attention" },
      {
        type: "paragraph",
        text: "Soft or porous stones require more restraint than hard, relatively durable varieties. Pearls, turquoise, opal and some treated or dyed materials are examples where moisture and cleaning products can present additional risks.",
      },
      {
        type: "paragraph",
        text: "For these materials, a dry, soft cloth is often the better choice. If the jewellery has persistent residue, ask a qualified jeweller or the supplier for material-specific advice rather than experimenting with stronger cleaners.",
      },
      {
        type: "paragraph",
        text: "Metal should also be considered separately. A stone may tolerate a particular cleaning method while its silver or gold-plated findings do not.",
      },
      { type: "heading", text: "A small habit after wearing" },
      {
        type: "paragraph",
        text: "After wearing a piece, gently wipe away fingerprints and surface oils before storing it in a dry, protected place. This reduces the accumulation of residue and helps preserve the appearance of polished surfaces.",
      },
      {
        type: "paragraph",
        text: "Clean only as much as necessary, use the gentlest method available, and never assume that every crystal responds to water in the same way.",
      },
      { type: "quote", text: "When in doubt, less is usually more." },
    ],
  },
  {
    slug: "moonstones-blue-sheen-and-labradorite",
    title: "Moonstone's blue sheen: how it differs from labradorite",
    displayDate: "12 November 2026",
    dateTime: "2026-11-12",
    category: "stones",
    dek: "Two stones can share an atmospheric flash of colour, yet their optical effects and mineral structures are different.",
    still: {
      src: "/journal/moonstones-blue-sheen-and-labradorite.webp",
      alt: "A milky moonstone cabochon with a soft blue under-surface glow beside a darker labradorite cabochon with a sharp electric-blue flash, on a warm cream surface.",
    },
    metaTitle: "Moonstone's blue sheen and labradorite | Jewellery Quintessential",
    metaDescription:
      "Moonstone and labradorite can share an atmospheric flash of colour, yet the way each stone holds light, and their mineral structures, are different.",
    related: [
      { label: "Labradorite Bracelet V", href: "https://jqd.app/products/labradorite-bracelet-v" },
      { label: "Labradorite Silver Pendant", href: "https://jqd.app/products/labradorite-silver-pendant" },
    ],
    body: [
      {
        type: "paragraph",
        text: "Moonstone and labradorite are often admired for the way they seem to hold light beneath their surfaces. Turn either stone slightly and a blue or silvery flash may appear, disappear or move across the polished face.",
      },
      {
        type: "paragraph",
        text: "At first glance, they can look remarkably similar. Both belong to the feldspar mineral family, and both display optical effects that make them particularly interesting in jewellery.",
      },
      {
        type: "paragraph",
        text: "The distinction lies in how light interacts with their internal structures.",
      },
      { type: "heading", text: "What makes moonstone glow blue?" },
      {
        type: "paragraph",
        text: "Moonstone is best known for an optical phenomenon called adularescence.",
      },
      {
        type: "paragraph",
        text: "Rather than appearing as a simple reflection from the surface, the light seems to float within the stone. It often takes the form of a soft, milky or bluish glow that shifts as the stone moves.",
      },
      {
        type: "paragraph",
        text: "This effect is associated with the interaction of light and microscopic internal layers or structural variations within the feldspar.",
      },
      {
        type: "paragraph",
        text: "The quality of the sheen depends on the stone's internal structure, clarity, cutting and orientation.",
      },
      {
        type: "paragraph",
        text: "Some moonstones show a delicate white glow. Others display a more pronounced blue sheen, particularly when viewed against a darker background. The light is often most compelling when it seems suspended just beneath the surface rather than sitting on top of it.",
      },
      { type: "heading", text: "What makes labradorite different?" },
      {
        type: "paragraph",
        text: "Labradorite is also a feldspar, but its characteristic optical effect is called labradorescence.",
      },
      {
        type: "paragraph",
        text: "Instead of a soft, floating glow, labradorite often displays more distinct flashes of colour. These can include electric blue, green, gold, yellow and, in some examples, orange or violet.",
      },
      {
        type: "paragraph",
        text: "The effect comes from light interacting with internal lamellae and structural features within the mineral. The resulting colours can appear in sharply defined areas that change as the stone is rotated.",
      },
      {
        type: "paragraph",
        text: "A polished labradorite may look relatively dark or subdued from one angle, then reveal a vivid blue or multicoloured flash from another. That contrast between a quiet base appearance and a sudden display of colour is part of its appeal.",
      },
      { type: "heading", text: "How to distinguish them" },
      {
        type: "paragraph",
        text: "The easiest starting point is to observe the character of the light.",
      },
      {
        type: "paragraph",
        text: "Moonstone generally has a softer, more diffuse glow. Its blue sheen appears to move across or float beneath a relatively translucent, often milky body.",
      },
      {
        type: "paragraph",
        text: "Labradorite tends to show more sharply defined areas of colour. Its flashes may be more intense and contrast strongly with a grey, dark or relatively opaque background.",
      },
      {
        type: "paragraph",
        text: "There are exceptions. Some moonstones have stronger flashes, and some labradorites display subtle blue effects rather than a dramatic spectrum. For this reason, colour alone is not a reliable way to identify either material.",
      },
      { type: "heading", text: "Why the cut matters" },
      {
        type: "paragraph",
        text: "Both stones are commonly cut as cabochons: smooth, rounded surfaces without traditional faceting. This form of cutting helps display their optical effects.",
      },
      {
        type: "paragraph",
        text: "The orientation of the stone is particularly important. A correctly oriented cabochon can reveal a more prominent sheen, while an unsuitable cut may cause the effect to appear weak or disappear when viewed from the front.",
      },
      {
        type: "paragraph",
        text: "This is why two stones of similar size and colour can have quite different visual appeal.",
      },
      { type: "heading", text: "What to look for when buying" },
      {
        type: "paragraph",
        text: "Look for photographs taken from several angles, preferably showing how the optical effect changes as the stone moves. A single front-facing photograph may not reveal the full character of the material.",
      },
      {
        type: "paragraph",
        text: "Also consider transparency, surface condition and the distribution of the sheen. A beautiful stone does not necessarily need to show the strongest possible flash. A quieter, more restrained effect can be equally appealing.",
      },
      {
        type: "paragraph",
        text: "When purchasing, check that the listing identifies the stone accurately rather than relying on broad descriptions such as blue flash crystal.",
      },
      { type: "heading", text: "Two expressions of light" },
      {
        type: "paragraph",
        text: "Moonstone and labradorite belong to the same mineral family, but they express light differently.",
      },
      {
        type: "paragraph",
        text: "One is often associated with a gentle, floating glow. The other can reveal vivid, sharply defined flashes of colour.",
      },
      {
        type: "paragraph",
        text: "Understanding the difference makes it easier to appreciate each stone for what it is, rather than treating them as interchangeable alternatives.",
      },
    ],
  },
  {
    slug: "jewellery-for-a-long-day-at-your-desk",
    title: "Jewellery for a long day at your desk",
    displayDate: "12 November 2026",
    dateTime: "2026-11-12",
    category: "dressing",
    dek: "When jewellery accompanies hours of sitting, typing and moving, comfort is found in weight, proportion and quiet details.",
    still: {
      src: "/journal/jewellery-for-a-long-day-at-your-desk.webp",
      alt: "A lightweight gemstone beaded bracelet on a nearly empty desk, with a closed book at the edge.",
    },
    metaTitle: "Jewellery for a long day at your desk | Jewellery Quintessential",
    metaDescription:
      "When jewellery accompanies hours of sitting, typing and moving, comfort is found in weight, proportion and quiet details, not in pieces that demand attention.",
    related: [
      { label: "Bracelets", href: "https://jqd.app/bracelets" },
      { label: "Necklaces", href: "https://jqd.app/necklaces" },
    ],
    body: [
      {
        type: "paragraph",
        text: "A piece of jewellery can look beautiful when first put on and become distracting several hours later.",
      },
      {
        type: "paragraph",
        text: "At a desk, small details become noticeable. A bracelet may touch the keyboard, a necklace may move against a collar, or a ring may feel uncomfortable when resting a hand on a desk.",
      },
      {
        type: "paragraph",
        text: "For jewellery intended to accompany a working day, the best choice is often the one that feels natural rather than demanding attention.",
      },
      { type: "heading", text: "Consider weight first" },
      {
        type: "paragraph",
        text: "Weight is one of the most important factors in everyday comfort.",
      },
      {
        type: "paragraph",
        text: "A substantial bracelet may look balanced on the wrist but become noticeable when worn for several hours, particularly if it moves around during typing. Lighter designs can be easier to wear throughout the day.",
      },
      {
        type: "paragraph",
        text: "This does not mean every piece needs to be delicate. It means the weight should feel appropriate for its size and construction.",
      },
      {
        type: "paragraph",
        text: "For necklaces, consider how the pendant sits and whether it moves excessively when you lean forward.",
      },
      {
        type: "paragraph",
        text: "For earrings, weight becomes particularly important over a long working day. A design that feels comfortable for an hour may become tiring when worn continuously.",
      },
      { type: "heading", text: "Think about movement and sound" },
      {
        type: "paragraph",
        text: "Jewellery often makes small sounds as different components come into contact. Metal spacers, beads, charms and loose connections can create a soft clink when a wrist moves across a desk or keyboard.",
      },
      {
        type: "paragraph",
        text: "Some people enjoy this subtle sound. Others find it distracting, especially in quiet working environments.",
      },
      {
        type: "paragraph",
        text: "If you prefer a quieter piece, look for designs with fewer freely moving components and more compact construction. Bracelets with closely arranged beads may produce a different experience from those with larger gaps, dangling charms or several metal elements.",
      },
      {
        type: "paragraph",
        text: "The clasp and connection details also matter. Loose components can move independently and create additional noise.",
      },
      { type: "heading", text: "The relationship with sleeves" },
      {
        type: "paragraph",
        text: "A bracelet with prominent settings, protruding components or an irregular silhouette may catch on knitwear or shirt cuffs. A smoother profile is often easier to wear with long sleeves.",
      },
      {
        type: "paragraph",
        text: "If you regularly wear tailored shirts or jackets, consider whether the bracelet will sit comfortably beneath the cuff.",
      },
      {
        type: "paragraph",
        text: "For necklaces, think about collar height and fabric. A longer pendant may interact differently with a shirt collar than a shorter necklace.",
      },
      {
        type: "paragraph",
        text: "The aim is not to choose jewellery that disappears. It is to choose proportions that work with the clothes you already wear.",
      },
      { type: "heading", text: "Rings and the keyboard" },
      {
        type: "paragraph",
        text: "Rings can be particularly noticeable when typing. Large raised settings may come into contact with neighbouring fingers, keys or the desk surface.",
      },
      {
        type: "paragraph",
        text: "A lower-profile design is often more comfortable for extended periods of keyboard use.",
      },
      {
        type: "paragraph",
        text: "Consider the shape of the band as well. A ring that feels comfortable when your hand is relaxed may feel different when your fingers are repeatedly extended and bent. Fit should allow normal movement without excessive pressure.",
      },
      {
        type: "paragraph",
        text: "If a ring catches on clothing or feels restrictive, it may not be the most suitable choice for a full working day.",
      },
      { type: "heading", text: "A simple combination" },
      {
        type: "paragraph",
        text: "One useful approach is to choose a small number of pieces that work across different settings.",
      },
      {
        type: "paragraph",
        text: "A lightweight gemstone bracelet can accompany everyday clothing without dominating the overall look. A simple necklace can add a point of colour while remaining suitable for meetings and later social occasions.",
      },
      {
        type: "paragraph",
        text: "The combination does not need to be perfectly matched. A restrained palette, consistent metal tone or shared visual character is usually enough to make different pieces feel connected.",
      },
      { type: "heading", text: "Comfort is personal" },
      {
        type: "paragraph",
        text: "There is no universal ideal weight or length for desk jewellery. Wrist size, hand movement, keyboard position, clothing and personal preference all influence comfort.",
      },
      {
        type: "paragraph",
        text: "The best test is to wear a piece during an ordinary working session rather than judging it only in front of a mirror.",
      },
      {
        type: "paragraph",
        text: "Notice whether it shifts, catches, makes unwanted noise or requires repeated adjustment. If it does, consider a lighter or more compact alternative.",
      },
      {
        type: "paragraph",
        text: "Jewellery for a working day should accommodate movement rather than compete with it.",
      },
      {
        type: "paragraph",
        text: "Thoughtful weight, smooth proportions and a considered arrangement of components can make a genuine difference: not by making jewellery purely functional, but by allowing beauty and practicality to exist together through the day.",
      },
    ],
  },
  {
    slug: "victorian-fascination-with-crystal-jewellery",
    title: "The Victorian fascination with crystal jewellery",
    displayDate: "12 November 2026",
    dateTime: "2026-11-12",
    category: "history",
    dek: "Changing fashions, new technologies and an interest in symbolism helped make crystal and gemstone jewellery part of a wider culture of personal expression.",
    still: {
      src: "/journal/victorian-fascination-with-crystal-jewellery.webp",
      alt: "A natural rock-crystal point with one loose amethyst, on a warm cream surface.",
    },
    metaTitle: "Victorian fascination with crystals | Jewellery Quintessential",
    metaDescription:
      "Changing fashions, new technologies and an interest in symbolism helped make crystal and gemstone jewellery part of a wider culture of personal expression.",
    related: [
      { label: "Our story", href: "https://jqd.app/story" },
      { label: "Necklaces", href: "https://jqd.app/necklaces" },
    ],
    body: [
      {
        type: "paragraph",
        text: "The Victorian period, spanning the reign of Queen Victoria from 1837 to 1901, was a time of considerable change in jewellery.",
      },
      {
        type: "paragraph",
        text: "Fashion evolved alongside industrialisation, expanding trade, new manufacturing methods and changing social customs. Jewellery became an expression of personal identity, sentiment and status. Crystals, coloured stones and glass all played roles in this changing visual culture.",
      },
      {
        type: "paragraph",
        text: "The period did not have one single jewellery style. It moved through several overlapping phases, each with its own preferences and influences.",
      },
      { type: "heading", text: "Early Victorian: sentiment and symbolism" },
      {
        type: "paragraph",
        text: "The early Victorian period was strongly associated with romantic symbolism.",
      },
      {
        type: "paragraph",
        text: "Jewellery often carried personal meaning through motifs such as flowers, hearts, leaves, bows and sentimental inscriptions. Gemstones could be selected for their colour, symbolic associations or personal significance.",
      },
      {
        type: "paragraph",
        text: "Mourning jewellery also became an important part of the period's visual culture. Pieces incorporating dark materials, including jet, were worn to express remembrance and grief.",
      },
      {
        type: "paragraph",
        text: "The use of gemstones and decorative materials was not simply about appearance. Objects could communicate relationships, memories and social customs.",
      },
      { type: "heading", text: "Mid-Victorian: richer colour and ornament" },
      {
        type: "paragraph",
        text: "As the period progressed, jewellery became more varied in form and decorative expression.",
      },
      {
        type: "paragraph",
        text: "Coloured gemstones, elaborate metalwork and contrasting materials appeared in different styles. Amethyst, garnet, turquoise, citrine and other stones were used in jewellery, often alongside pearls and decorative glass.",
      },
      {
        type: "paragraph",
        text: "The increasing availability of materials through international trade influenced what could be incorporated into jewellery design. Larger compositions, elaborate settings and decorative details became part of fashionable dress, and the visual richness of jewellery could communicate social position and personal taste.",
      },
      { type: "heading", text: "Crystal, glass and the changing material landscape" },
      {
        type: "paragraph",
        text: "The word crystal can refer to different materials in jewellery contexts. Historically, natural rock crystal, other natural gemstones and manufactured glass all had their own uses and visual appeal.",
      },
      {
        type: "paragraph",
        text: "Rock crystal, a transparent variety of quartz, had a long history in decorative objects and jewellery before the Victorian period.",
      },
      {
        type: "paragraph",
        text: "During the nineteenth century, improvements in glass production and cutting techniques also expanded the possibilities for imitation stones and decorative crystal-like materials. Cut glass and paste stones could create brilliant effects at a different price point from many natural gemstones. They allowed jewellery makers to explore sparkle, colour and elaborate compositions without relying exclusively on rare natural materials.",
      },
      {
        type: "paragraph",
        text: "The distinction between natural gemstone, rock crystal and manufactured glass is important when interpreting historical pieces. Not everything described today as crystal jewellery would necessarily have been made from natural quartz.",
      },
      { type: "heading", text: "Late Victorian: evolving forms" },
      {
        type: "paragraph",
        text: "Towards the end of the nineteenth century, jewellery styles continued to evolve.",
      },
      {
        type: "paragraph",
        text: "Natural motifs, including flowers, insects and flowing forms, became increasingly prominent in some design movements. There was also growing interest in the relationship between artistic expression and jewellery design.",
      },
      {
        type: "paragraph",
        text: "This period helped establish a visual language in which materials were not valued solely for rarity or price. Form, colour, craftsmanship and the relationship between decorative elements also mattered.",
      },
      { type: "heading", text: "Why Victorian jewellery remains interesting" },
      {
        type: "paragraph",
        text: "Victorian jewellery offers more than a collection of historical shapes. It reflects the relationship between personal sentiment, social customs, technological developments and changing access to materials.",
      },
      {
        type: "paragraph",
        text: "A piece could be decorative, symbolic, commemorative or simply fashionable. This variety is one reason the period remains a useful reference for contemporary jewellery design.",
      },
      { type: "heading", text: "Looking at the past without reproducing it" },
      {
        type: "paragraph",
        text: "Modern jewellery can draw inspiration from Victorian design without copying its ornament or proportions.",
      },
      {
        type: "paragraph",
        text: "The use of rich gemstone colours, delicate arrangements, contrasting materials and symbolic forms can all be reconsidered in a contemporary way.",
      },
      {
        type: "paragraph",
        text: "For Jewellery Quintessential · \u6975\u6C23, the enduring interest lies in the relationship between material and meaning.",
      },
      {
        type: "quote",
        text: "People have long used stones and decorative objects to express something beyond appearance.",
      },
      {
        type: "paragraph",
        text: "Victorian jewellery reminds us that people have long used stones and decorative objects to express something beyond appearance. A gemstone can be appreciated for its colour and form while also carrying associations shaped by history, memory and personal choice.",
      },
    ],
  },
];

const CATEGORY_SLUGS = new Set<string>(JOURNAL_CATEGORIES.map((item) => item.slug));

export function parseJournalCategory(value: string | undefined): JournalCatalogueCategory {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw || raw === "all") return "all";
  if (CATEGORY_SLUGS.has(raw)) return raw as JournalCategory;
  return "unknown";
}

export function journalCategoryLabel(category: JournalCatalogueCategory): string | null {
  return JOURNAL_CATEGORIES.find((item) => item.slug === category)?.label ?? null;
}

export function journalFilterStatus(category: JournalCatalogueCategory): string | null {
  const label = journalCategoryLabel(category);
  if (!label || category === "all") return null;
  return `Showing notes in ${label}.`;
}

export function journalEmptyMessage(category: JournalCatalogueCategory, query: string): string {
  if (query.trim()) return "No notes match this search.";
  const label = journalCategoryLabel(category);
  if (label && category !== "all") return `No notes in ${label}.`;
  return "No notes match this search.";
}

export function filterJournalPosts(
  posts: readonly JournalPost[],
  { category, query }: { category: JournalCatalogueCategory; query: string }
): JournalPost[] {
  const needle = query.trim().toLowerCase();
  return posts.filter((post) => {
    if (category === "unknown") return false;
    if (category !== "all" && post.category !== category) return false;
    if (!needle) return true;
    return `${post.title}\n${post.dek}`.toLowerCase().includes(needle);
  });
}

export function getJournalPost(slug: string): JournalPost | undefined {
  return JOURNAL_POSTS.find((post) => post.slug === slug);
}

export function journalCategoryHref(slug: (typeof JOURNAL_CATEGORIES)[number]["slug"]): string {
  return slug === "all" ? "/journal" : `/journal?category=${slug}`;
}
