import type { ReactNode } from 'react'
import { Icons } from '@/components/shop/icons'

export type Product = {
  id: number
  name: string
  category: string
  description: string
  price: number
  tag: string | null
  icon: ReactNode
  calories: number
  protein: string
}

export type BrandKey = 'fitbull' | 'elevate'

export type Brand = {
  key: BrandKey
  /** path under /menu */
  slug: string
  /** Short eyebrow shown above the title */
  eyebrow: string
  /** Big display title, may contain the × */
  title: string
  /** One-line pitch for the menu hero */
  tagline: string
  categories: string[]
  products: Product[]
}

/* ===== Elevate × Fitbull — high-performance sports nutrition ===== */
const fitbullProducts: Product[] = [
  {
    id: 101,
    name: 'Power Bowl Fitbull',
    category: 'Bowls',
    description: 'Arroz integral, doble pechuga grillada, huevo, palta y aderezo de yogurt griego.',
    price: 52,
    tag: 'Signature',
    icon: Icons.bowl,
    calories: 680,
    protein: '52g'
  },
  {
    id: 102,
    name: 'Shake Mass Gainer',
    category: 'Batidos',
    description: 'Proteína whey, avena, plátano, mantequilla de maní y leche deslactosada.',
    price: 32,
    tag: 'Top',
    icon: Icons.dumbbell,
    calories: 520,
    protein: '45g'
  },
  {
    id: 103,
    name: 'Wrap Atlético de Pollo',
    category: 'Wraps',
    description: 'Tortilla de espinaca, pollo desmechado, quinua, vegetales y salsa picante.',
    price: 42,
    tag: null,
    icon: Icons.wrap,
    calories: 480,
    protein: '40g'
  },
  {
    id: 104,
    name: 'Combo Pre-Entreno',
    category: 'Combos',
    description: 'Tostada integral con huevo, café americano y shot de energía natural.',
    price: 38,
    tag: 'Energía',
    icon: Icons.flame,
    calories: 410,
    protein: '26g'
  },
  {
    id: 105,
    name: 'Bowl Recovery Salmón',
    category: 'Bowls',
    description: 'Salmón a la plancha, batata, brócoli, semillas y vinagreta cítrica.',
    price: 58,
    tag: 'Recovery',
    icon: Icons.salad,
    calories: 560,
    protein: '44g'
  },
  {
    id: 106,
    name: 'Protein Pancakes',
    category: 'Post-Entreno',
    description: 'Hotcakes de avena y whey con frutos rojos, miel y nibs de cacao.',
    price: 36,
    tag: null,
    icon: Icons.egg,
    calories: 470,
    protein: '34g'
  },
  {
    id: 107,
    name: 'Snack Box Atleta',
    category: 'Snacks',
    description: 'Barras proteicas caseras, almendras, huevos cocidos y fruta de estación.',
    price: 28,
    tag: null,
    icon: Icons.nut,
    calories: 360,
    protein: '28g'
  },
  {
    id: 108,
    name: 'Hydra Shake Cítrico',
    category: 'Batidos',
    description: 'Electrolitos naturales, naranja, jengibre y BCAAs para reponer minerales.',
    price: 26,
    tag: 'Nuevo',
    icon: Icons.cup,
    calories: 180,
    protein: '12g'
  }
]

/* ===== Catering Elevate — the signature healthy catering menu ===== */
const elevateProducts: Product[] = [
  {
    id: 1,
    name: 'Bowl Proteico Andino',
    category: 'Bowls',
    description: 'Quinua real, pollo grillado, aguacate, vegetales frescos y aderezo de chía.',
    price: 45,
    tag: 'Popular',
    icon: Icons.bowl,
    calories: 520,
    protein: '38g'
  },
  {
    id: 2,
    name: 'Smoothie Energía Tropical',
    category: 'Bebidas',
    description: 'Açaí, plátano, mango, espinaca fresca y proteína vegetal de alta calidad.',
    price: 28,
    tag: 'Nuevo',
    icon: Icons.cup,
    calories: 280,
    protein: '18g'
  },
  {
    id: 3,
    name: 'Wrap Fit de Pavo',
    category: 'Wraps',
    description: 'Tortilla integral, pavo ahumado, hummus casero, verduras crujientes.',
    price: 38,
    tag: null,
    icon: Icons.wrap,
    calories: 420,
    protein: '32g'
  },
  {
    id: 4,
    name: 'Ensalada Power Green',
    category: 'Ensaladas',
    description: 'Mix de hojas verdes, salmón, semillas de girasol, frutos rojos y vinagreta.',
    price: 42,
    tag: 'Best Seller',
    icon: Icons.salad,
    calories: 380,
    protein: '28g'
  },
  {
    id: 5,
    name: 'Snack Box Proteico',
    category: 'Snacks',
    description: 'Mix de frutos secos, barras proteicas caseras, frutas deshidratadas.',
    price: 25,
    tag: null,
    icon: Icons.nut,
    calories: 320,
    protein: '22g'
  },
  {
    id: 6,
    name: 'Açaí Bowl Premium',
    category: 'Bowls',
    description: 'Açaí orgánico, granola artesanal, frutas frescas, miel y coco rallado.',
    price: 35,
    tag: 'Favorito',
    icon: Icons.berry,
    calories: 450,
    protein: '24g'
  },
  {
    id: 7,
    name: 'Ensalada Mediterránea',
    category: 'Ensaladas',
    description: 'Garbanzos, tomate cherry, pepino, aceitunas, feta y aderezo de limón.',
    price: 39,
    tag: null,
    icon: Icons.salad,
    calories: 360,
    protein: '20g'
  },
  {
    id: 8,
    name: 'Limonada de Jengibre',
    category: 'Bebidas',
    description: 'Limón natural, jengibre fresco, menta y un toque de miel de abeja.',
    price: 18,
    tag: null,
    icon: Icons.cup,
    calories: 90,
    protein: '0g'
  }
]

export const BRANDS: Record<BrandKey, Brand> = {
  fitbull: {
    key: 'fitbull',
    slug: 'fitbull',
    eyebrow: 'Colaboración',
    title: 'Elevate × Fitbull',
    tagline: 'Nutrición deportiva de alto rendimiento, lista para tu entreno.',
    categories: ['Todos', 'Bowls', 'Batidos', 'Wraps', 'Combos', 'Post-Entreno', 'Snacks'],
    products: fitbullProducts,
  },
  elevate: {
    key: 'elevate',
    slug: 'elevate',
    eyebrow: 'Nuestra casa',
    title: 'Catering Elevate',
    tagline: 'Comida saludable, fresca y deliciosa para cada momento del día.',
    categories: ['Todos', 'Bowls', 'Ensaladas', 'Wraps', 'Bebidas', 'Snacks'],
    products: elevateProducts,
  },
}
