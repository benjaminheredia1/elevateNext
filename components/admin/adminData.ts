/* ===== MOCK DATA FOR ADMIN PANEL ===== */

export type ProductStatus = 'active' | 'inactive'
export type OrderStatus = 'new' | 'preparing' | 'ontheway' | 'delivered' | 'cancelled'
export type DriverStatus = 'available' | 'onroute' | 'offline'

/* ===== Fase 1 — paridad con el wizard/tabla del zip ===== */
export type PublishStatus = 'publicado' | 'borrador' | 'archivado'
export type ProductType = 'elaborado' | 'reventa'
/** Un ítem de receta = un insumo con su cantidad utilizada por porción. */
export interface RecipeItem {
  insumo_id: number
  cantidad_utilizada: number
}

export interface AdminProduct {
  id: number
  name: string
  category: string
  description: string
  price: number
  cost: number
  stock: number
  status: ProductStatus
  calories: number
  protein: string
  sales: number
  /* — campos de paridad (opcionales para no romper usos existentes) — */
  type?: ProductType
  publishStatus?: PublishStatus
  /** Marcas reales (Marca/ProductoMarca) = "menús" del zip. */
  marcaIds?: number[]
  photoUrl?: string
  recipe?: RecipeItem[]
  resaleIngredientId?: number | null
  /** costo calculado server-side (food cost) */
  costoCalculado?: number
  foodCostPct?: number
}

export interface OrderItem {
  name: string
  qty: number
  price: number
}

export interface AdminOrder {
  id: string
  customer: string
  phone: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  createdAt: string
  address: string
  driverId?: number
}

export interface Driver {
  id: number
  name: string
  initials: string
  phone: string
  status: DriverStatus
  rating: number
  deliveriesToday: number
  totalDeliveries: number
  currentOrder?: string
  lat: number
  lng: number
}

export interface DailySales {
  day: string
  revenue: number
  orders: number
}

/* ===== PRODUCTS ===== */
export const initialProducts: AdminProduct[] = [
  { id: 1, name: 'Bowl Proteico Andino', category: 'Bowls', description: 'Quinua real, pollo grillado, aguacate, vegetales frescos y aderezo de chía.', price: 45, cost: 18, stock: 32, status: 'active', calories: 520, protein: '38g', sales: 245 },
  { id: 2, name: 'Smoothie Energía Tropical', category: 'Bebidas', description: 'Açaí, plátano, mango, espinaca fresca y proteína vegetal.', price: 28, cost: 10, stock: 48, status: 'active', calories: 280, protein: '18g', sales: 198 },
  { id: 3, name: 'Wrap Fit de Pavo', category: 'Wraps', description: 'Tortilla integral, pavo ahumado, hummus casero, verduras crujientes.', price: 38, cost: 15, stock: 20, status: 'active', calories: 420, protein: '32g', sales: 167 },
  { id: 4, name: 'Ensalada Power Green', category: 'Ensaladas', description: 'Mix de hojas verdes, salmón, semillas de girasol, frutos rojos y vinagreta.', price: 42, cost: 17, stock: 15, status: 'active', calories: 380, protein: '28g', sales: 312 },
  { id: 5, name: 'Snack Box Proteico', category: 'Snacks', description: 'Mix de frutos secos, barras proteicas caseras, frutas deshidratadas.', price: 25, cost: 9, stock: 60, status: 'active', calories: 320, protein: '22g', sales: 89 },
  { id: 6, name: 'Açaí Bowl Premium', category: 'Bowls', description: 'Açaí orgánico, granola artesanal, frutas frescas, miel y coco rallado.', price: 35, cost: 13, stock: 25, status: 'active', calories: 450, protein: '24g', sales: 278 },
  { id: 7, name: 'Jugo Verde Detox', category: 'Bebidas', description: 'Pepino, apio, manzana verde, jengibre y limón. Prensado en frío.', price: 22, cost: 7, stock: 40, status: 'active', calories: 120, protein: '4g', sales: 156 },
  { id: 8, name: 'Bowl Mediterráneo', category: 'Bowls', description: 'Falafel casero, hummus, tabouleh, tomate cherry y salsa tahini.', price: 40, cost: 16, stock: 0, status: 'inactive', calories: 480, protein: '26g', sales: 134 },
  { id: 9, name: 'Protein Pancakes', category: 'Desayunos', description: 'Pancakes de avena y proteína, frutos rojos, miel de abeja y mantequilla de maní.', price: 32, cost: 11, stock: 28, status: 'active', calories: 410, protein: '30g', sales: 201 },
  { id: 10, name: 'Wrap de Salmón Ahumado', category: 'Wraps', description: 'Salmón ahumado, queso crema light, rúcula, alcaparras y eneldo.', price: 48, cost: 22, stock: 12, status: 'active', calories: 460, protein: '34g', sales: 95 },
]

/* ===== ORDERS ===== */
export const initialOrders: AdminOrder[] = [
  { id: 'ORD-1042', customer: 'María López', phone: '+591 72345678', items: [{ name: 'Bowl Proteico Andino', qty: 2, price: 45 }, { name: 'Smoothie Energía Tropical', qty: 1, price: 28 }], total: 118, status: 'new', createdAt: '18:25', address: 'Av. Monseñor Rivero #234' },
  { id: 'ORD-1041', customer: 'Carlos Gutiérrez', phone: '+591 76543210', items: [{ name: 'Ensalada Power Green', qty: 1, price: 42 }, { name: 'Jugo Verde Detox', qty: 2, price: 22 }], total: 86, status: 'preparing', createdAt: '18:10', address: 'Calle Beni #456', driverId: 2 },
  { id: 'ORD-1040', customer: 'Ana Sofía Rojas', phone: '+591 71122334', items: [{ name: 'Wrap Fit de Pavo', qty: 1, price: 38 }, { name: 'Açaí Bowl Premium', qty: 1, price: 35 }], total: 73, status: 'ontheway', createdAt: '17:45', address: '2do Anillo, Av. Alemana #789', driverId: 1 },
  { id: 'ORD-1039', customer: 'Pedro Morales', phone: '+591 70998877', items: [{ name: 'Protein Pancakes', qty: 3, price: 32 }], total: 96, status: 'delivered', createdAt: '17:20', address: 'Av. San Martín #1020', driverId: 3 },
  { id: 'ORD-1038', customer: 'Lucía Fernández', phone: '+591 73344556', items: [{ name: 'Bowl Proteico Andino', qty: 1, price: 45 }, { name: 'Snack Box Proteico', qty: 2, price: 25 }], total: 95, status: 'delivered', createdAt: '16:55', address: 'Barrio Equipetrol, Calle 7' },
  { id: 'ORD-1037', customer: 'Diego Vargas', phone: '+591 78899001', items: [{ name: 'Wrap de Salmón Ahumado', qty: 2, price: 48 }], total: 96, status: 'cancelled', createdAt: '16:30', address: 'Av. Bush #345' },
  { id: 'ORD-1036', customer: 'Valentina Cruz', phone: '+591 74455667', items: [{ name: 'Smoothie Energía Tropical', qty: 2, price: 28 }, { name: 'Açaí Bowl Premium', qty: 1, price: 35 }], total: 91, status: 'delivered', createdAt: '15:50', address: 'Calle Junín #678' },
  { id: 'ORD-1035', customer: 'Roberto Paz', phone: '+591 79988776', items: [{ name: 'Ensalada Power Green', qty: 2, price: 42 }, { name: 'Jugo Verde Detox', qty: 1, price: 22 }], total: 106, status: 'delivered', createdAt: '15:15', address: '3er Anillo Interno #901' },
]

/* ===== DRIVERS ===== */
export const initialDrivers: Driver[] = [
  { id: 1, name: 'Juan Mamani', initials: 'JM', phone: '+591 72233445', status: 'onroute', rating: 4.8, deliveriesToday: 7, totalDeliveries: 342, currentOrder: 'ORD-1040', lat: -17.7745, lng: -63.1870 },
  { id: 2, name: 'Miguel Chávez', initials: 'MC', phone: '+591 73344556', status: 'onroute', rating: 4.9, deliveriesToday: 5, totalDeliveries: 289, currentOrder: 'ORD-1041', lat: -17.7720, lng: -63.1930 },
  { id: 3, name: 'Roberto Flores', initials: 'RF', phone: '+591 74455667', status: 'available', rating: 4.7, deliveriesToday: 8, totalDeliveries: 456, lat: -17.7700, lng: -63.1960 },
  { id: 4, name: 'Carlos Quispe', initials: 'CQ', phone: '+591 75566778', status: 'available', rating: 4.6, deliveriesToday: 4, totalDeliveries: 178, lat: -17.7680, lng: -63.1990 },
  { id: 5, name: 'Fernando Rojas', initials: 'FR', phone: '+591 76677889', status: 'offline', rating: 4.5, deliveriesToday: 0, totalDeliveries: 134, lat: -17.7660, lng: -63.2020 },
]

/* ===== DAILY SALES (last 7 days) ===== */
export const dailySales: DailySales[] = [
  { day: 'Lun', revenue: 2340, orders: 34 },
  { day: 'Mar', revenue: 2890, orders: 41 },
  { day: 'Mié', revenue: 2120, orders: 29 },
  { day: 'Jue', revenue: 3450, orders: 48 },
  { day: 'Vie', revenue: 4120, orders: 57 },
  { day: 'Sáb', revenue: 4680, orders: 65 },
  { day: 'Hoy', revenue: 3200, orders: 44 },
]

/* ===== STATUS HELPERS ===== */
export const orderStatusMap: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Nuevo', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  preparing: { label: 'Preparando', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  ontheway: { label: 'En camino', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  delivered: { label: 'Entregado', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  cancelled: { label: 'Cancelado', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
}

export const driverStatusMap: Record<DriverStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Disponible', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  onroute: { label: 'En ruta', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  offline: { label: 'Offline', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
}

export const categories = ['Todos', 'Bowls', 'Bebidas', 'Wraps', 'Ensaladas', 'Snacks', 'Desayunos']
