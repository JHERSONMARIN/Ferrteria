// Personal: altas, cambios (rol, módulos, sucursal, contraseña) y bajas. Toda modificación queda auditada,
// y la contraseña nunca se guarda en la auditoría: solo que se cambió.
import { hashPassword, validateNewPassword } from '@ferresys/shared/passwords';
import type { prisma } from '../../db.ts';
import type { SessionUser } from '../../types/express.d.ts';
import { changedFields, recordAudit } from '../audit/index.ts';
import { getActiveModules, requireWithinLimit } from '../licensing/index.ts';
import { getSettings } from '../settings/index.ts';
import { MAIN_ADMIN_ID, StaffError, assertCanManage, moduleList, type Role } from './permissions.ts';
import type { z } from '@ferresys/contracts/zod';
import type { CreateStaffBody, UpdateStaffBody } from '@ferresys/contracts/identity';

type Client = typeof prisma;

// Solo se pueden asignar módulos que la empresa tenga contratados y activos.
async function assertModulesAllowed(client: Client, modules: string[] | null | undefined): Promise<string[] | undefined> {
  if (modules === undefined || modules === null) return undefined;
  const allowed = getActiveModules(await getSettings(client));
  const outside = modules.filter(m => !allowed.includes(m));
  if (outside.length > 0) throw new StaffError(`Estos módulos no están disponibles en el plan de la empresa: ${outside.join(', ')}.`);
  return modules;
}

// Sucursal asignada: debe existir y estar activa. Sin valor, la indicada por defecto.
async function branchFor(client: Client, branchId: number | undefined, fallback: number): Promise<number> {
  if (branchId === undefined) return fallback;
  const branch = await client.branch.findUnique({ where: { id: branchId }, select: { active: true } });
  if (!branch || !branch.active) throw new StaffError('La sucursal elegida no existe o está desactivada.');
  return branchId;
}

const PUBLIC_FIELDS = { id: true, name: true, user: true, role: true, modules: true, active: true, branchId: true } as const;

export async function listStaff(client: Client) {
  const staff = await client.usuario.findMany({
    select: { ...PUBLIC_FIELDS, createdAt: true, branch: { select: { id: true, name: true } } },
    orderBy: { id: 'desc' },
  });
  return staff.map(person => ({ ...person, modules: moduleList(person.modules) }));
}

// La clave la define quien da de alta: el empleado debe cambiarla al ingresar.
export async function createStaff(client: Client, input: z.infer<typeof CreateStaffBody>, actor: SessionUser) {
  const { name, user: username } = input;
  const role = input.role ?? 'VENDEDOR';
  assertCanManage(actor, { newRole: role });
  validateNewPassword(input.pass);

  if (await client.usuario.findUnique({ where: { user: username } })) throw new StaffError('El nombre de usuario ya existe. Elija otro.');
  // El plan limita cuántos usuarios activos puede tener la empresa.
  requireWithinLimit('maxUsers', await client.usuario.count({ where: { active: true } }), 'usuario(s)');
  const modules = await assertModulesAllowed(client, input.modules) ?? ['pos'];
  const branchId = await branchFor(client, input.branchId, actor.branchId);
  const pass = await hashPassword(input.pass);

  return client.$transaction(async (tx) => {
    const created = await tx.usuario.create({
      data: { name, user: username, pass, mustChangePassword: true, role, modules, active: true, branchId },
      select: PUBLIC_FIELDS,
    });
    await recordAudit(tx, {
      action: 'USER_CREATED',
      entity: 'Usuario',
      entityId: created.id,
      summary: `Usuario ${created.user} (${created.name}) creado como ${created.role}`,
      details: { user: created.user, role: created.role, modules: created.modules, branchId: created.branchId },
      user: actor,
    });
    return created;
  });
}

export async function updateStaff(client: Client, id: number, input: z.infer<typeof UpdateStaffBody>, actor: SessionUser) {
  const { name, user: username } = input;

  const current = await client.usuario.findUnique({ where: { id } });
  if (!current) throw new StaffError('Usuario no encontrado.', 404);
  const role = input.role ?? current.role as Role;
  assertCanManage(actor, { currentRole: current.role, newRole: role });

  if (username.toLowerCase() !== current.user.toLowerCase()) {
    const taken = await client.usuario.findUnique({ where: { user: username } });
    if (taken && taken.id !== id) throw new StaffError('El nombre de usuario ya está siendo usado por otro empleado.');
  }

  const data: {
    name: string; user: string; role: typeof role; modules: string[];
    branchId?: number; active?: boolean; pass?: string; mustChangePassword?: boolean;
  } = {
    name, user: username, role,
    modules: await assertModulesAllowed(client, input.modules) ?? (current.modules as string[]),
  };

  if (input.branchId !== undefined) {
    const branchId = await branchFor(client, input.branchId, current.branchId);
    if (branchId !== current.branchId) {
      // Lo que cobre iría a una caja de la otra sucursal: primero debe salir de su turno.
      const inShift = await client.cashSessionMember.count({ where: { userId: id, leftAt: null, session: { estado: 'ABIERTA' } } });
      if (inShift > 0) throw new StaffError('Está en un turno de caja abierto: debe cerrarlo o salir antes de cambiar de sucursal.', 409);
    }
    data.branchId = branchId;
  }

  if (input.active !== undefined) {
    if (id === MAIN_ADMIN_ID && !input.active) throw new StaffError('No se puede desactivar al Administrador principal del sistema.');
    data.active = input.active;
  }

  if (input.pass) {
    validateNewPassword(input.pass);
    data.pass = await hashPassword(input.pass);
    // Si se restablece la clave de otra persona, queda como temporal.
    data.mustChangePassword = id !== actor.id;
  }

  return client.$transaction(async (tx) => {
    const saved = await tx.usuario.update({
      where: { id },
      data,
      select: { ...PUBLIC_FIELDS, createdAt: true, updatedAt: true },
    });
    const changes = changedFields(current, saved, ['name', 'user', 'role', 'modules', 'active', 'branchId']) ?? {};
    if (data.pass) changes.password = { before: null, after: 'restablecida' };
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, {
        action: 'USER_UPDATED',
        entity: 'Usuario',
        entityId: id,
        summary: `Usuario ${saved.user}: ${Object.keys(changes).join(', ')}`,
        details: changes,
        user: actor,
      });
    }
    return saved;
  });
}

// Solo se puede eliminar a quien no tiene ventas ni movimientos; si los tiene, se desactiva.
export async function deleteStaff(client: Client, id: number, actor: SessionUser) {
  if (id === MAIN_ADMIN_ID) throw new StaffError('No se puede eliminar el usuario administrador principal del sistema.');
  const target = await client.usuario.findUnique({ where: { id }, select: { user: true, name: true, role: true } });
  if (!target) throw new StaffError('Usuario no encontrado.', 404);
  assertCanManage(actor, { currentRole: target.role });

  await client.$transaction(async (tx) => {
    // La auditoría se escribe antes de borrar: su usuario queda en null pero conserva el nombre.
    await recordAudit(tx, {
      action: 'USER_DELETED', entity: 'Usuario', entityId: id, summary: `Usuario ${target.user} (${target.name}) eliminado`, details: target, user: actor,
    });
    await tx.usuario.delete({ where: { id } });
  });
  return { success: true };
}
