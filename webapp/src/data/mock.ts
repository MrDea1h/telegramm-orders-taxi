import type { Address, AppUser, Driver, Order, VerificationRequest } from './types'

export const favoriteAddresses: Address[] = [
  { id: 'addr-office', label: 'Офис', addressText: 'ул. Тверская, 12', isFavorite: true },
  { id: 'addr-home', label: 'Дом', addressText: 'Ленинский проспект, 45, кв. 87', isFavorite: true },
  { id: 'addr-airport', label: 'Аэропорт', addressText: 'Шереметьево, терминал D', isFavorite: true },
]

export const recentAddresses: Address[] = [
  { id: 'addr-1', label: '', addressText: 'Пресненская наб., 8, стр. 1' },
  { id: 'addr-2', label: '', addressText: 'ул. Кузнецкий Мост, 3' },
]

export const drivers: Driver[] = [
  {
    id: 'drv-1',
    fullName: 'Игорь Соколов',
    avatarColor: '#7C3AED',
    car: { model: 'Skoda Octavia', plate: 'А 412 ОР 777', color: 'белый' },
    isActive: true,
    rating: 4.9,
  },
  {
    id: 'drv-2',
    fullName: 'Марат Юсупов',
    avatarColor: '#3B82F6',
    car: { model: 'Hyundai Sonata', plate: 'В 118 КХ 777', color: 'чёрный' },
    isActive: true,
    rating: 4.8,
  },
  {
    id: 'drv-3',
    fullName: 'Дмитрий Носов',
    avatarColor: '#10B981',
    car: { model: 'Kia K5', plate: 'Е 902 АА 199', color: 'серебристый' },
    isActive: false,
    rating: 5.0,
  },
]

export const currentUser: AppUser = {
  id: 'usr-1',
  fullName: 'Анна Кириллова',
  role: 'user',
  status: 'verified',
  canOrder: true,
  tripsCount: 14,
}

export const upcomingOrder: Order = {
  id: 'ord-1001',
  status: 'confirmed',
  from: favoriteAddresses[0],
  to: favoriteAddresses[2],
  scheduledAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
  etaMin: 38,
  distanceKm: 21.4,
  passengers: 1,
  driverId: 'drv-1',
  createdByName: 'Анна Кириллова',
}

export const orderHistory: Order[] = [
  {
    id: 'ord-998',
    status: 'completed',
    from: favoriteAddresses[1],
    to: favoriteAddresses[0],
    scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    etaMin: 24,
    distanceKm: 12.1,
    passengers: 1,
    driverId: 'drv-2',
    createdByName: 'Анна Кириллова',
  },
  {
    id: 'ord-991',
    status: 'completed',
    from: favoriteAddresses[0],
    to: recentAddresses[0],
    scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
    etaMin: 15,
    distanceKm: 6.4,
    passengers: 2,
    driverId: 'drv-1',
    createdByName: 'Анна Кириллова',
  },
  {
    id: 'ord-980',
    status: 'cancelled_by_user',
    from: favoriteAddresses[0],
    to: favoriteAddresses[1],
    scheduledAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
    etaMin: 22,
    distanceKm: 11.0,
    passengers: 1,
    createdByName: 'Анна Кириллова',
  },
]

export const driverQueue: Order[] = [
  {
    id: 'ord-2001',
    status: 'pending_driver',
    from: { id: 'a', label: '', addressText: 'БЦ «Око», Пресненская наб., 2' },
    to: { id: 'b', label: '', addressText: 'Внуково, терминал А' },
    scheduledAt: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    etaMin: 45,
    distanceKm: 26.8,
    passengers: 2,
    createdByName: 'Павел Северов',
  },
  {
    id: 'ord-2002',
    status: 'confirmed',
    from: { id: 'c', label: '', addressText: 'ул. Тверская, 12' },
    to: { id: 'd', label: '', addressText: 'Ленинский проспект, 45' },
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    etaMin: 27,
    distanceKm: 13.2,
    passengers: 1,
    createdByName: 'Ольга Стрельцова',
  },
  {
    id: 'ord-2003',
    status: 'driver_en_route',
    from: { id: 'e', label: '', addressText: 'Офис, ул. Тверская, 12' },
    to: { id: 'f', label: '', addressText: 'Шереметьево, терминал D' },
    scheduledAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    etaMin: 38,
    distanceKm: 21.4,
    passengers: 1,
    createdByName: 'Анна Кириллова',
  },
  {
    id: 'ord-2004',
    status: 'completed',
    from: { id: 'g', label: '', addressText: 'Аэропорт Домодедово' },
    to: { id: 'h', label: '', addressText: 'ул. Кузнецкий Мост, 3' },
    scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    etaMin: 52,
    distanceKm: 34.9,
    passengers: 3,
    createdByName: 'Игнат Волков',
  },
]

export const verificationRequests: VerificationRequest[] = [
  {
    id: 'vr-1',
    fullName: 'Егор Панин',
    email: 'e.panin@corp.ru',
    tgUsername: '@epanin',
    requestedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
  {
    id: 'vr-2',
    fullName: 'Светлана Дорохова',
    phone: '+7 916 000-11-22',
    tgUsername: '@sdorokhova',
    requestedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'vr-3',
    fullName: 'Тимур Гареев',
    email: 't.gareev@corp.ru',
    tgUsername: '@tgareev',
    requestedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
]

export const adminUsers: AppUser[] = [
  { id: 'usr-1', fullName: 'Анна Кириллова', role: 'user', status: 'verified', canOrder: true, tripsCount: 14 },
  { id: 'usr-2', fullName: 'Павел Северов', role: 'user', status: 'verified', canOrder: true, tripsCount: 6 },
  { id: 'usr-3', fullName: 'Ольга Стрельцова', role: 'user', status: 'verified', canOrder: true, tripsCount: 3 },
  { id: 'usr-4', fullName: 'Игорь Соколов', role: 'driver', status: 'verified', canOrder: false, tripsCount: 214 },
  { id: 'usr-5', fullName: 'Марина Ефимова', role: 'user', status: 'blocked', canOrder: false, tripsCount: 1 },
]

export const timeSlots = ['09:00', '09:30', '10:15', '11:00', '13:30', '14:00', '15:45', '16:30', '18:00']

export const weeklyTrips = [
  { day: 'Пн', count: 8 },
  { day: 'Вт', count: 12 },
  { day: 'Ср', count: 9 },
  { day: 'Чт', count: 15 },
  { day: 'Пт', count: 18 },
  { day: 'Сб', count: 4 },
  { day: 'Вс', count: 2 },
]

export const topRoutes = [
  { route: 'Офис → Аэропорт Шереметьево', count: 32 },
  { route: 'Офис → Дом', count: 27 },
  { route: 'Дом → Офис', count: 25 },
  { route: 'Офис → Домодедово', count: 11 },
]
