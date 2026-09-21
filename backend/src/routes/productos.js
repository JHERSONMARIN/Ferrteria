import express from 'express';
import { prisma } from '../db.js';
import { quantityProblem, roundQuantity } from '../utils/quantities.js';
import { recordAudit, changedFields } from '../services/audit.js';
import { resolveBranchId, BranchError } from '../services/branches.js';

const router = express.Router();

// Precio mayorista opcional: vacío = sin precio mayorista (null); false = valor inválido.
function parseWholesalePrice(value) {
  if (value === undefined || value === null || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : false;
}

const BRANCH_STOCK_SELECT = { select: { branchId: true, stock: true, reserved: true } };
const SALE_UNITS_SELECT = {
  where: { active: true },
  select: { id: true, name: true, factor: true, price: true, wholesalePrice: true, code: true, allowsFractions: true },
  orderBy: { factor: 'asc' },
};
const MAX_SALE_UNITS = 10;

class ProductError extends Error {}

// Presentaciones de venta que manda el formulario: [{ id?, name, factor, price, wholesalePrice?, code?, allowsFractions? }].
// undefined = no se tocan; [] = se quitan todas.
export function parseSaleUnits(raw, baseUnitName) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new ProductError('Las presentaciones no son válidas.');
  if (raw.length > MAX_SALE_UNITS) throw new ProductError(`Se permiten hasta ${MAX_SALE_UNITS} presentaciones por producto.`);

  const names = new Set([String(baseUnitName || 'Unidad').trim().toLowerCase()]);
  const codes = new Set();
  return raw.map((u, i) => {
    const name = String(u?.name ?? '').trim().slice(0, 40);
    const factor = Number(u?.factor);
    const price = Number(u?.price);
    const wholesale = parseWholesalePrice(u?.wholesalePrice);
    const code = u?.code ? String(u.code).trim().slice(0, 60) : null;
    const label = name || `la presentación ${i + 1}`;
    if (!name) throw new ProductError(`Falta el nombre de la presentación ${i + 1}.`);
    if (names.has(name.toLowerCase())) throw new ProductError(`La presentación "${name}" está repetida o es igual a la unidad base.`);
    names.add(name.toLowerCase());
    if (!Number.isFinite(factor) || factor <= 0 || roundQuantity(factor) !== factor) {
      throw new ProductError(`Indique cuántas unidades base trae ${label} (mayor a 0, hasta 3 decimales).`);
    }
    if (!Number.isFinite(price) || price <= 0) throw new ProductError(`El precio de ${label} debe ser mayor a 0.`);
    if (wholesale === false) throw new ProductError(`El precio mayorista de ${label} debe ser mayor a 0.`);
    if (code) {
      if (codes.has(code)) throw new ProductError(`El código ${code} está repetido en las presentaciones.`);
      codes.add(code);
    }
    const id = Number(u?.id);
    return {
      id: Number.isInteger(id) && id > 0 ? id : null,
      name, factor, price: Math.round(price * 100) / 100, wholesalePrice: wholesale, code, allowsFractions: u?.allowsFractions === true,
    };
  });
}

// Deja activas exactamente las presentaciones indicadas. Las quitadas se desactivan (las ventas
// pasadas las siguen referenciando) y una con el nombre de otra desactivada la reactiva.
export async function syncSaleUnits(tx, productId, units, productCode) {
  if (units === undefined) return;
  if (units.some(u => u.code && u.code === productCode)) {
    throw new ProductError('Una presentación no puede tener el mismo código que el producto.');
  }
  const existing = await tx.productUnit.findMany({ where: { productoId: productId } });
  const keep = new Set();
  for (const unit of units) {
    const match = existing.find(e => e.id === unit.id) || existing.find(e => e.name.toLowerCase() === unit.name.toLowerCase());
    const data = {
      name: unit.name, factor: unit.factor, price: unit.price, wholesalePrice: unit.wholesalePrice,
      code: unit.code, allowsFractions: unit.allowsFractions, active: true,
    };
    if (match) {
      keep.add(match.id);
      await tx.productUnit.update({ where: { id: match.id }, data });
    } else {
      const created = await tx.productUnit.create({ data: { ...data, productoId: productId } });
      keep.add(created.id);
    }
  }
  await tx.productUnit.updateMany({
    where: { productoId: productId, id: { notIn: [...keep] }, active: true },
    data: { active: false, code: null },
  });
}

// El código de una presentación no puede ser el de otro producto (el escáner no sabría cuál es).
async function assertUnitCodesFree(db, units, productId = null) {
  const codes = (units || []).map(u => u.code).filter(Boolean);
  if (codes.length === 0) return;
  const clash = await db.producto.findFirst({
    where: { code: { in: codes }, ...(productId ? { id: { not: productId } } : {}) },
    select: { code: true },
  });
  if (clash) throw new ProductError(`El código ${clash.code} ya es de otro producto.`);
}

// Y al revés: el código del producto no puede ser el de una presentación de otro producto.
async function assertProductCodeFree(db, code, productId = null) {
  const clash = await db.productUnit.findFirst({
    where: { code: String(code).trim(), ...(productId ? { productoId: { not: productId } } : {}) },
    select: { name: true, producto: { select: { name: true } } },
  });
  if (clash) throw new ProductError(`El código ya es de la presentación ${clash.name} de ${clash.producto.name}.`);
}

// stock/reserved son los de la sucursal del usuario (lo que puede vender); totalStock/totalReserved,
// los de toda la empresa, y branches el detalle por sucursal.
function withBranchStock({ branchStocks, stock, reserved, ...product }, branchId) {
  const own = branchStocks.find(b => b.branchId === branchId);
  return {
    ...product,
    stock: own?.stock ?? 0,
    reserved: own?.reserved ?? 0,
    totalStock: stock,
    totalReserved: reserved,
    branches: branchStocks,
  };
}

// GET /api/productos
router.get('/', async (req, res) => {
  try {
    const products = await prisma.producto.findMany({
      where: { active: true },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        allowsFractions: true,
        stock: true,
        reserved: true,
        wholesalePrice: true,
        minStock: true,
        price: true,
        category: true,
        branchStocks: BRANCH_STOCK_SELECT,
        saleUnits: SALE_UNITS_SELECT,
      },
      orderBy: { name: 'asc' }
    });
    res.json(products.map(p => withBranchStock(p, req.user.branchId)));
  } catch (error) {
    res.status(500).json({ error: 'Error al listar productos.' });
  }
});

// GET /api/productos/categorias
router.get('/categorias', async (req, res) => {
  try {
    const dbCategories = await prisma.categoria.findMany({
      where: { active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    const distinctProductCategories = await prisma.producto.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    const set = new Set([
      ...dbCategories.map(c => c.name),
      ...distinctProductCategories.map(p => p.category).filter(Boolean),
    ]);

    res.json(Array.from(set));
  } catch (error) {
    console.error('[productos.js] Error al listar categorías:', error);
    res.status(500).json({ error: 'Error al listar categorías.' });
  }
});

// POST /api/productos
router.post('/', async (req, res) => {
  try {
    const { code, name, unit, stock, price, category, categoriaId, minStock } = req.body;
    const usuarioId = req.user.id;
    // El stock inicial entra a la sucursal del usuario (o la que indique el administrador).
    const branchId = await resolveBranchId(prisma, req.user, req.body.branchId);
    if (!code || !name || isNaN(stock) || isNaN(price)) {
      return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
    }

    const allowsFractions = req.body.allowsFractions === true;
    const wholesale = parseWholesalePrice(req.body.wholesalePrice);
    if (wholesale === false) return res.status(400).json({ error: 'El precio mayorista debe ser mayor a 0.' });
    const stockNum = Number(stock);
    const priceNum = parseFloat(price);
    const minStockNum = minStock === undefined || minStock === '' ? 10 : Number(minStock);
    if (stockNum !== 0) {
      const problem = quantityProblem(stockNum, allowsFractions);
      if (problem) return res.status(400).json({ error: `El stock inicial ${problem}.` });
    }
    if (!Number.isFinite(minStockNum) || minStockNum < 0) {
      return res.status(400).json({ error: 'El stock mínimo no es válido.' });
    }
    const categoryName = category && category.trim() ? category.trim() : 'General';
    const saleUnits = parseSaleUnits(req.body.saleUnits, unit || 'Unidad');
    await assertUnitCodesFree(prisma, saleUnits);
    await assertProductCodeFree(prisma, code);

    // Resolver Categoria relacional
    let resolvedCatId = categoriaId ? parseInt(categoriaId, 10) : null;
    if (!resolvedCatId && categoryName) {
      let catRecord = await prisma.categoria.findUnique({
        where: { name: categoryName },
      });
      if (!catRecord) {
        catRecord = await prisma.categoria.create({
          data: { name: categoryName },
        });
      }
      resolvedCatId = catRecord.id;
    }

    // Operación atómica para registrar producto y stock inicial en Kardex
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.producto.create({
        data: {
          code: code.trim(),
          name: name.trim(),
          unit: unit || 'Unidad',
          allowsFractions,
          wholesalePrice: wholesale,
          stock: stockNum,
          minStock: minStockNum,
          price: priceNum,
          category: categoryName,
          categoriaId: resolvedCatId,
        },
      });

      await tx.branchStock.create({ data: { branchId, productoId: p.id, stock: stockNum } });
      await syncSaleUnits(tx, p.id, saleUnits, p.code);

      if (stockNum > 0) {
        await tx.movimientoKardex.create({
          data: {
            productoId: p.id,
            type: 'ENTRADA',
            qty: stockNum,
            stockAfter: stockNum,
            ref: 'Stock Inicial al Registrar',
            usuarioId: usuarioId ? parseInt(usuarioId, 10) : null,
            branchId,
          },
        });
      }

      return p;
    });

    res.status(201).json(product);
  } catch (error) {
    if (error instanceof ProductError) return res.status(400).json({ error: error.message });
    if (error instanceof BranchError) return res.status(error.status).json({ error: error.message });
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe un producto registrado con este código.' });
    }
    console.error('[productos.js] Error al registrar producto:', error);
    res.status(500).json({ error: 'Error al registrar producto.' });
  }
});

// PUT /api/productos/:id (Editar datos del producto; el stock se ajusta vía Kardex)
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { code, name, unit, price, category, categoriaId, minStock, allowsFractions } = req.body;

    if (!code || !code.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: 'El código y el nombre son obligatorios.' });
    }
    if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return res.status(400).json({ error: 'El precio debe ser un número mayor a 0.' });
    }

    const categoryName = category && category.trim() ? category.trim() : 'General';
    let resolvedCatId = categoriaId ? parseInt(categoriaId, 10) : null;

    if (!resolvedCatId && categoryName) {
      let catRecord = await prisma.categoria.findUnique({
        where: { name: categoryName },
      });
      if (!catRecord) {
        catRecord = await prisma.categoria.create({
          data: { name: categoryName },
        });
      }
      resolvedCatId = catRecord.id;
    }

    const wholesale = parseWholesalePrice(req.body.wholesalePrice);
    if (wholesale === false) return res.status(400).json({ error: 'El precio mayorista debe ser mayor a 0.' });
    const saleUnits = parseSaleUnits(req.body.saleUnits, unit || 'Unidad');
    await assertUnitCodesFree(prisma, saleUnits, id);
    await assertProductCodeFree(prisma, code, id);

    const current = await prisma.producto.findUnique({
      where: { id },
      select: { code: true, name: true, price: true, wholesalePrice: true, branchStocks: BRANCH_STOCK_SELECT },
    });
    if (!current) return res.status(404).json({ error: 'Producto no encontrado.' });

    // No se puede dejar de vender fraccionado si el stock de alguna sucursal tiene decimales.
    const hasDecimals = current.branchStocks.some(b => !Number.isInteger(b.stock) || !Number.isInteger(b.reserved));
    if (allowsFractions === false && hasDecimals) {
      return res.status(400).json({ error: 'El stock actual tiene decimales: ajústelo en Kardex antes de venderlo solo por unidades.' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.producto.update({
        where: { id },
        data: {
          code: code.trim(),
          name: name.trim(),
          unit: unit || 'Unidad',
          allowsFractions: typeof allowsFractions === 'boolean' ? allowsFractions : undefined,
          wholesalePrice: req.body.wholesalePrice === undefined ? undefined : wholesale,
          price: parseFloat(price),
          category: categoryName,
          categoriaId: resolvedCatId,
          minStock: minStock !== undefined && minStock !== '' && Number(minStock) >= 0 ? Number(minStock) : undefined,
        },
        select: {
          id: true, code: true, name: true, unit: true, allowsFractions: true, wholesalePrice: true,
          stock: true, minStock: true, price: true, category: true, categoriaId: true,
        },
      });

      await syncSaleUnits(tx, id, saleUnits, product.code);

      const priceChanges = changedFields(current, product, ['price', 'wholesalePrice']);
      if (priceChanges) {
        const describe = (label, change) => `${label} S/ ${change.before ?? '—'} → S/ ${change.after ?? '—'}`;
        await recordAudit(tx, {
          action: 'PRICE_CHANGED',
          entity: 'Producto',
          entityId: id,
          summary: `${product.code} ${product.name}: ` + [
            priceChanges.price && describe('precio', priceChanges.price),
            priceChanges.wholesalePrice && describe('mayorista', priceChanges.wholesalePrice),
          ].filter(Boolean).join(', '),
          details: priceChanges,
          user: req.user,
        });
      }
      return product;
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof ProductError) return res.status(400).json({ error: error.message });
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Ya existe otro producto o presentación con este código.' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    console.error('[productos.js] Error al actualizar producto:', error);
    res.status(500).json({ error: 'Error al actualizar producto.' });
  }
});

const MAX_IMPORT_ROWS = 2000;
const yes = (v) => v === true || ['si', 'sí', 's', 'yes', 'x', '1', 'true', 'verdadero'].includes(String(v ?? '').trim().toLowerCase());
const numOrNull = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

// Revisa una fila de la importación. Devuelve { data } o { error } (mismas reglas que el formulario).
function parseImportRow(row) {
  const code = String(row?.code ?? '').trim();
  const name = String(row?.name ?? '').trim();
  const unit = String(row?.unit ?? '').trim() || 'Unidad';
  const category = String(row?.category ?? '').trim() || 'General';
  const allowsFractions = yes(row?.allowsFractions);
  const price = numOrNull(row?.price);
  const wholesalePrice = numOrNull(row?.wholesalePrice);
  const stock = numOrNull(row?.stock) ?? 0;
  const minStock = numOrNull(row?.minStock) ?? 10;

  if (code.length < 2 || code.length > 60) return { error: 'El código debe tener entre 2 y 60 caracteres.' };
  if (name.length < 2 || name.length > 120) return { error: 'El nombre debe tener entre 2 y 120 caracteres.' };
  if (unit.length > 30) return { error: 'La unidad es demasiado larga.' };
  if (category.length > 60) return { error: 'La categoría es demasiado larga.' };
  if (price === null || Number.isNaN(price) || price <= 0 || price > 1000000) return { error: 'El precio debe ser un número mayor a 0.' };
  if (Number.isNaN(wholesalePrice) || (wholesalePrice !== null && wholesalePrice <= 0)) return { error: 'El precio mayorista debe ser mayor a 0 o quedar vacío.' };
  if (Number.isNaN(stock) || stock < 0) return { error: 'El stock inicial no puede ser negativo.' };
  if (stock > 0 && quantityProblem(stock, allowsFractions)) return { error: `El stock inicial ${quantityProblem(stock, allowsFractions)}.` };
  if (Number.isNaN(minStock) || minStock < 0) return { error: 'El stock mínimo no puede ser negativo.' };
  return {
    data: {
      code, name, unit, category, allowsFractions,
      price: Math.round(price * 100) / 100,
      wholesalePrice: wholesalePrice === null ? null : Math.round(wholesalePrice * 100) / 100,
      stock, minStock,
    },
  };
}

// POST /api/productos/importar  { rows: [...], onExisting: 'update' | 'skip' }
// Todo o nada: si una fila tiene problemas no se guarda ninguna y se devuelven los errores por fila.
// A los productos que ya existen nunca se les cambia el stock (eso se hace con un movimiento).
router.post('/importar', async (req, res) => {
  try {
    const rows = req.body?.rows;
    const onExisting = req.body?.onExisting === 'update' ? 'update' : 'skip';
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No hay filas para importar.' });
    if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Se pueden importar hasta ${MAX_IMPORT_ROWS} filas por vez.` });
    const branchId = await resolveBranchId(prisma, req.user, req.body.branchId);

    const errors = [];
    const parsed = [];
    const seen = new Map();
    rows.forEach((row, i) => {
      const { data, error } = parseImportRow(row);
      if (error) return errors.push({ index: i, error });
      const key = data.code.toLowerCase();
      if (seen.has(key)) return errors.push({ index: i, error: `El código ${data.code} se repite en la fila ${seen.get(key) + 1}.` });
      seen.set(key, i);
      parsed.push({ index: i, ...data });
    });

    const codes = parsed.map(r => r.code);
    const [existing, unitClashes] = await Promise.all([
      prisma.producto.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true, name: true, price: true, wholesalePrice: true, active: true, branchStocks: BRANCH_STOCK_SELECT },
      }),
      prisma.productUnit.findMany({ where: { code: { in: codes } }, select: { code: true, name: true } }),
    ]);
    const byCode = new Map(existing.map(p => [p.code, p]));
    const clashCodes = new Map(unitClashes.map(u => [u.code, u.name]));
    for (const row of parsed) {
      if (clashCodes.has(row.code)) errors.push({ index: row.index, error: `El código ya es de la presentación ${clashCodes.get(row.code)} de otro producto.` });
      const current = byCode.get(row.code);
      const decimals = current?.branchStocks.some(b => !Number.isInteger(b.stock) || !Number.isInteger(b.reserved));
      if (current && onExisting === 'update' && !row.allowsFractions && decimals) {
        errors.push({ index: row.index, error: 'El stock actual tiene decimales: no se puede pasar a venta solo por unidades.' });
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Hay filas con problemas: corríjalas antes de importar.', rows: errors.sort((a, b) => a.index - b.index) });
    }

    const result = await prisma.$transaction(async (tx) => {
      const summary = { created: 0, updated: 0, skipped: 0, categoriesCreated: 0 };
      const categoryIds = new Map();
      const categoryIdFor = async (name) => {
        if (categoryIds.has(name)) return categoryIds.get(name);
        let cat = await tx.categoria.findUnique({ where: { name }, select: { id: true } });
        if (!cat) {
          cat = await tx.categoria.create({ data: { name }, select: { id: true } });
          summary.categoriesCreated++;
        }
        categoryIds.set(name, cat.id);
        return cat.id;
      };

      for (const row of parsed) {
        const current = byCode.get(row.code);
        if (current && onExisting === 'skip') { summary.skipped++; continue; }
        const categoriaId = await categoryIdFor(row.category);
        const data = {
          name: row.name, unit: row.unit, allowsFractions: row.allowsFractions, price: row.price,
          wholesalePrice: row.wholesalePrice, minStock: row.minStock, category: row.category, categoriaId,
        };

        if (current) {
          await tx.producto.update({ where: { id: current.id }, data: { ...data, active: true } });
          const priceChanges = changedFields(current, row, ['price', 'wholesalePrice']);
          if (priceChanges) {
            await recordAudit(tx, {
              action: 'PRICE_CHANGED',
              entity: 'Producto',
              entityId: current.id,
              summary: `${row.code} ${row.name}: precios cambiados por importación`,
              details: priceChanges,
              user: req.user,
            });
          }
          summary.updated++;
          continue;
        }

        const product = await tx.producto.create({ data: { ...data, code: row.code, stock: row.stock } });
        await tx.branchStock.create({ data: { branchId, productoId: product.id, stock: row.stock } });
        if (row.stock > 0) {
          await tx.movimientoKardex.create({
            data: {
              productoId: product.id, type: 'ENTRADA', qty: row.stock, stockAfter: row.stock,
              ref: 'Stock inicial (importación)', usuarioId: req.user.id, branchId,
            },
          });
        }
        summary.created++;
      }
      return summary;
    }, { timeout: 120000 });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof BranchError) return res.status(error.status).json({ error: error.message });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Otro usuario registró uno de estos códigos mientras se importaba. Vuelva a intentarlo.' });
    console.error('[productos.js] Error al importar productos:', error);
    res.status(500).json({ error: 'No se pudo completar la importación. No se guardó ningún producto.' });
  }
});

// GET /api/productos/barcode/:code (Proxy a OpenFoodFacts o DB)
router.get('/barcode/:code', async (req, res) => {
  try {
    const barcode = req.params.code.trim();
    // 1. Buscar primero en base de datos local
    const local = await prisma.producto.findUnique({
      where: { code: barcode },
      select: {
        id: true, code: true, name: true, unit: true, allowsFractions: true, stock: true, reserved: true, price: true, category: true,
        branchStocks: BRANCH_STOCK_SELECT,
      },
    });

    if (local) {
      return res.json({ foundInDb: true, product: withBranchStock(local, req.user.branchId) });
    }

    // 2. Si no está en DB local, buscar en API pública (OpenFoodFacts)
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 1 && data.product && data.product.product_name) {
      return res.json({ foundInDb: false, name: data.product.product_name });
    }

    res.status(404).json({ error: 'Producto no encontrado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar código de barras.' });
  }
});

export default router;
