// Datos que usan varias pantallas (productos, clientes, caja…): una sola consulta por clave, compartida.
// Lo propio de una pantalla se consulta en su carpeta de features/.
import { useQuery } from '@tanstack/react-query';
import type { CashStatus } from '@ferresys/contracts/cash';
import type { Category, Product } from '@ferresys/contracts/catalog';
import type { Customer } from '@ferresys/contracts/customers';
import type { StaffMember } from '@ferresys/contracts/identity';
import { api } from './client.ts';
import { queryKeys } from './queryClient.ts';

export const fetchCashStatus = () => api.get<CashStatus>('/caja/estado-actual');

export const useProducts = (enabled = true) =>
  useQuery({ queryKey: queryKeys.products, queryFn: () => api.get<Product[]>('/productos'), enabled });

export const useCategories = (enabled = true) =>
  useQuery({ queryKey: queryKeys.categories, queryFn: () => api.get<Category[]>('/categorias'), enabled });

export const useCustomers = (enabled = true) =>
  useQuery({ queryKey: queryKeys.customers, queryFn: () => api.get<Customer[]>('/clientes'), enabled });

export const useCashStatus = (enabled = true) =>
  useQuery({ queryKey: queryKeys.cashStatus, queryFn: fetchCashStatus, enabled });

export const useStaff = (enabled = true) =>
  useQuery({ queryKey: queryKeys.staff, queryFn: () => api.get<StaffMember[]>('/personal'), enabled });
