export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface User {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone: string | null;
  role: 'admin' | 'customer';
  status: 'active' | 'inactive';
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Plan {
  _id: string;
  name: string;
  description: string;
  category: 'personal' | 'business';
  pricing: {
    monthly: number;
    yearly: number;
  };
  isActive: boolean;
  speed: {
    download: number;
    upload: number;
    unit: string;
  };
  dataLimit: {
    amount?: number;
    unit?: string;
    unlimited: boolean;
  };
  features: Array<{
    name: string;
    description: string;
    included: boolean;
  }>;
}

export interface DashboardStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  topPlans: string[];
}

export interface Subscription {
  _id: string;
  userId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired';
  startDate: string;
  endDate: string;
  plan: Plan;
  billingCycle: 'monthly' | 'yearly';
  pricing: {
    totalAmount: number;
    currency: string;
  };
  autoRenew: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PlanFilters {
  category?: 'personal' | 'business';
  priceRange?: {
    min: number;
    max: number;
  };
  speedRange?: {
    min: number;
    max: number;
  };
  regions?: string[];
  technology?: string;
  unlimited?: boolean;
}

export interface PlanCreateRequest {
  name: string;
  description: string;
  pricing: {
    monthly: number;
    yearly: number;
  };
  speed: {
    download: number;
    upload: number;
    unit: string;
  };
  dataLimit: {
    amount?: number;
    unit?: string;
    unlimited: boolean;
  };
  features: Array<{
    name: string;
    description: string;
    included: boolean;
  }>;
  category: 'personal' | 'business';
  isActive: boolean;
}

export interface DashboardStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalRevenue: number;
  topPlans: string[];
}