// Rutas HTTP del catálogo: /api/productos y /api/categorias.
import express, { type Request, type Response } from 'express';
import { z } from '@ferresys/contracts/zod';
import { AppError, errorBody } from '@ferresys/shared/errors';
import { prisma } from '../../../db.ts';
import { id, optionalId, parseInput } from '../../../lib/validation.ts';
import { CategoryError, ProductError } from '../domain/catalog.ts';
import {
  createProduct, findByBarcode, importProducts, listCategoryNames, listProducts, updateProduct,
} from '../application/products.ts';
import {
  createCategory, deleteCategory, importCategories, listCategories, updateCategory,
} from '../application/categories.ts';
import type { Sendable } from '@ferresys/contracts/common';
import type {
  BarcodeLookup, Category, CategoryDeleted, CategoryImportResult, Product, ProductImportResult,
} from '@ferresys/contracts/catalog';

type Handler = (req: Request, res: Response) => Promise<unknown>;

interface Messages {
  /** Error 500 que ve el usuario. */
  failure: string;
  /** Si la base rechaza un código o nombre repetido (P2002): [estado, mensaje]. */
  duplicate?: [number, string];
}

const handle = (fn: Handler, messages: Messages) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof AppError) return res.status(error.status).json(errorBody(error));
    const code = (error as { code?: string }).code;
    if (code === 'P2002' && messages.duplicate) return res.status(messages.duplicate[0]).json({ error: messages.duplicate[1] });
    if (code === 'P2025') return res.status(404).json({ error: 'No se encontró el registro.' });
    console.error(`[catálogo] ${messages.failure}`, error);
    res.status(500).json({ error: messages.failure });
  }
};

const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

// ---------- /api/productos ----------

const ProductParams = z.object({ id: id('Producto no válido.') });
const productId = (req: Request) => parseInput(ProductParams, req.params, m => new ProductError(m)).id;

export const productRoutes = express.Router();

// GET /api/productos: con el stock de la sucursal del usuario y el de la empresa.
productRoutes.get('/', handle(async (req, res) => {
  res.json(await listProducts(prisma, req.user) satisfies Sendable<Product[]>);
}, { failure: 'Error al listar productos.' }));

// GET /api/productos/categorias: nombres para los formularios.
productRoutes.get('/categorias', handle(async (req, res) => {
  res.json(await listCategoryNames(prisma));
}, { failure: 'Error al listar categorías.' }));

// POST /api/productos
productRoutes.post('/', handle(async (req, res) => {
  res.status(201).json(await createProduct(prisma, body(req), req.user));
}, { failure: 'Error al registrar producto.', duplicate: [400, 'Ya existe un producto registrado con este código.'] }));

// PUT /api/productos/:id  (el stock no se edita aquí: se ajusta con un movimiento de kardex)
productRoutes.put('/:id', handle(async (req, res) => {
  res.json(await updateProduct(prisma, productId(req), body(req), req.user));
}, { failure: 'Error al actualizar producto.', duplicate: [400, 'Ya existe otro producto o presentación con este código.'] }));

// POST /api/productos/importar  { rows: [...], onExisting: 'update' | 'skip', branchId? }
productRoutes.post('/importar', handle(async (req, res) => {
  const { rows, onExisting, branchId } = body(req);
  res.json({ success: true, ...await importProducts(prisma, { rows, onExisting, branchId }, req.user) } satisfies Sendable<ProductImportResult>);
}, {
  failure: 'No se pudo completar la importación. No se guardó ningún producto.',
  duplicate: [409, 'Otro usuario registró uno de estos códigos mientras se importaba. Vuelva a intentarlo.'],
}));

// GET /api/productos/barcode/:code
productRoutes.get('/barcode/:code', handle(async (req, res) => {
  res.json(await findByBarcode(prisma, String(req.params.code), req.user) satisfies Sendable<BarcodeLookup>);
}, { failure: 'Error al buscar código de barras.' }));

// ---------- /api/categorias ----------

const CategoryParams = z.object({ id: id('ID de categoría no válido.') });
const categoryId = (req: Request) => parseInput(CategoryParams, req.params, m => new CategoryError(m)).id;
const DeleteQuery = z.object({ targetCategoryId: optionalId('Categoría de destino no válida.') });

export const categoryRoutes = express.Router();

// GET /api/categorias?all=true  (con métricas; all=true incluye las inactivas)
categoryRoutes.get('/', handle(async (req, res) => {
  res.json(await listCategories(prisma, req.query.all === 'true') satisfies Sendable<Category[]>);
}, { failure: 'Error al obtener la lista de categorías.' }));

categoryRoutes.post('/', handle(async (req, res) => {
  res.status(201).json(await createCategory(prisma, body(req)));
}, { failure: 'Error al registrar la categoría.', duplicate: [400, 'Ya existe una categoría con este nombre.'] }));

// POST /api/categorias/importar  { rows: [{ name, description, icon, color }], onExisting }
categoryRoutes.post('/importar', handle(async (req, res) => {
  const { rows, onExisting } = body(req);
  res.json({ success: true, ...await importCategories(prisma, { rows, onExisting }) } satisfies Sendable<CategoryImportResult>);
}, {
  failure: 'No se pudo completar la importación. No se guardó ninguna categoría.',
  duplicate: [409, 'Otra persona creó una de estas categorías mientras se importaba. Vuelva a intentarlo.'],
}));

categoryRoutes.put('/:id', handle(async (req, res) => {
  res.json(await updateCategory(prisma, categoryId(req), body(req)));
}, { failure: 'Error al actualizar la categoría.', duplicate: [400, 'Ya existe otra categoría con este nombre.'] }));

// DELETE /api/categorias/:id?targetCategoryId=  (con productos, se reasignan a la de destino)
categoryRoutes.delete('/:id', handle(async (req, res) => {
  const { targetCategoryId } = parseInput(DeleteQuery, req.query, m => new CategoryError(m));
  res.json(await deleteCategory(prisma, categoryId(req), targetCategoryId ?? null) satisfies Sendable<CategoryDeleted>);
}, { failure: 'Error al eliminar la categoría.' }));
