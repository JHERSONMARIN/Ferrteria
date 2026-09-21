import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import FieldError from '../components/FieldError.jsx';
import { borderClass } from '../utils/validators.js';
import { useToast, useConfirm, SearchInput, EmptyState, Modal, Button, Field, Input } from '../components/ui/index.js';

export default function ClientesPage({ initialSearch = '' }) {
  const aviso = useToast();
  const confirmar = useConfirm();
  const [clients, setClients] = useState([]);
  // Búsqueda por nombre o documento: con muchas cuentas es la única forma de encontrar una.
  const [busqueda, setBusqueda] = useState(initialSearch);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // Cliente que se está editando; null al registrar uno nuevo.
  const [editing, setEditing] = useState(null);
  // Ventana del límite de crédito.
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditValue, setCreditValue] = useState('');
  const [creditError, setCreditError] = useState('');

  // Form State
  const [cliType, setCliType] = useState('Natural');
  const [cliDoc, setCliDoc] = useState('');
  const [cliName, setCliName] = useState('');
  const [cliPhone, setCliPhone] = useState('');
  const [cliEmail, setCliEmail] = useState('');
  const [cliAddress, setCliAddress] = useState('');
  const [maxCredit, setMaxCredit] = useState('1000');
  const [priceList, setPriceList] = useState('RETAIL');
  const [errors, setErrors] = useState({});

  useEffect(() => { if (initialSearch) setBusqueda(initialSearch); }, [initialSearch]);

  const sinTildes = (t) => (t || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const clientesFiltrados = clients.filter(c => {
    const q = sinTildes(busqueda).trim();
    if (!q) return true;
    return sinTildes(c.name).includes(q) || sinTildes(c.doc).includes(q) || sinTildes(c.phone).includes(q);
  });

  const clearError = (field) => setErrors(prev => ({ ...prev, [field]: '' }));

  const validateClient = () => {
    const e = {};
    const doc = cliDoc.trim();
    if (!doc) {
      e.doc = 'El documento es obligatorio.';
    } else if (cliType === 'Empresa' && !/^\d{11}$/.test(doc)) {
      e.doc = 'El RUC debe tener exactamente 11 dígitos.';
    } else if (cliType === 'Natural' && !/^\d{8}$/.test(doc)) {
      e.doc = 'El DNI debe tener exactamente 8 dígitos.';
    }

    if (!cliName.trim()) e.name = 'El nombre / razón social es obligatorio.';
    else if (cliName.trim().length < 3) e.name = 'Debe tener al menos 3 caracteres.';

    if (cliPhone.trim() && !/^\+?\d[\d\s-]{5,14}$/.test(cliPhone.trim()))
      e.phone = 'Teléfono inválido (6 a 15 dígitos).';

    if (cliEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliEmail.trim()))
      e.email = 'Correo electrónico inválido.';

    // Al editar, el crédito se cambia desde su propio botón.
    if (!editing) {
      const mc = parseFloat(maxCredit);
      if (maxCredit === '' || isNaN(mc)) e.maxCredit = 'Ingrese un monto válido.';
      else if (mc < 0) e.maxCredit = 'El límite no puede ser negativo.';
      else if (mc > 1000000) e.maxCredit = 'El límite es demasiado alto.';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await api.get('/clientes');
      setClients(data);
    } catch (err) {
      aviso.error('Error cargando clientes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillForm = (c) => {
    setErrors({});
    setCliType(c?.type === 'EMPRESA' ? 'Empresa' : 'Natural');
    setCliDoc(c?.doc || '');
    setCliName(c?.name || '');
    setCliPhone(c?.phone || '');
    setCliEmail(c?.email || '');
    setCliAddress(c?.address || '');
    setMaxCredit('1000');
    setPriceList('RETAIL');
  };

  const openNew = () => { setEditing(null); fillForm(null); setShowModal(true); };
  const openEdit = (client) => { setEditing(client); fillForm(client); setShowModal(true); };
  const closeModal = () => { if (!loading) setShowModal(false); };

  const handleSaveClient = async () => {
    if (!validateClient()) return;

    const datos = {
      type: cliType,
      doc: cliDoc.trim(),
      name: cliName.trim(),
      phone: cliPhone.trim(),
      email: cliEmail.trim(),
      address: cliAddress.trim(),
    };
    try {
      setLoading(true);
      if (editing) {
        await api.put(`/clientes/${editing.id}`, datos);
      } else {
        await api.post('/clientes', { ...datos, maxCredit: parseFloat(maxCredit) || 1000.0, priceList });
      }
      setShowModal(false);
      await loadClients();
      aviso.exito(editing ? 'Datos del cliente actualizados.' : 'Cliente guardado con éxito.');
    } catch (err) {
      aviso.error('Error al guardar cliente: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCredit = (client) => {
    setCreditTarget(client);
    setCreditValue(String(client.maxCredit));
    setCreditError('');
  };

  const handleSaveCredit = async () => {
    const parsed = parseFloat(creditValue);
    if (creditValue === '' || isNaN(parsed) || parsed < 0) return setCreditError('Ingrese un monto válido.');
    if (parsed > 1000000) return setCreditError('El límite es demasiado alto.');

    try {
      setLoading(true);
      await api.put(`/clientes/${creditTarget.id}/max-credit`, { maxCredit: parsed });
      setCreditTarget(null);
      await loadClients();
      aviso.exito('Límite de crédito actualizado.');
    } catch (err) {
      setCreditError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePriceList = async (client) => {
    const next = client.priceList === 'WHOLESALE' ? 'RETAIL' : 'WHOLESALE';
    const label = next === 'WHOLESALE' ? 'mayorista' : 'minorista';
    const seguro = await confirmar({
      title: 'Cambiar la lista de precios',
      description: `${client.name} pasará a la lista ${label}.`,
      confirmText: 'Cambiar',
    });
    if (!seguro) return;
    try {
      setLoading(true);
      await api.put(`/clientes/${client.id}/price-list`, { priceList: next });
      await loadClients();
    } catch (err) {
      aviso.error('Error al cambiar la lista de precios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tab-content active h-full p-4 overflow-auto">
      <div className="bg-surface rounded-xl shadow-sm border border-line flex-1 flex flex-col min-h-full">
        <div className="p-4 border-b border-line flex justify-between items-center bg-surface-muted">
          <div>
            <p className="text-sm font-bold text-ink">
              {busqueda ? `${clientesFiltrados.length} de ${clients.length}` : clients.length} cliente{clients.length === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted">Datos del cliente y su límite de crédito (fiado).</p>
          </div>
          <button onClick={openNew} className="bg-brand hover:bg-brand-strong text-brand-contrast px-4 py-2 rounded-xl text-sm font-semibold shadow-card transition-colors flex items-center gap-2">
            <i className="fa-solid fa-user-plus"></i> Nuevo cliente
          </button>
        </div>

        <div className="p-4 border-b border-line">
          <SearchInput
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, DNI/RUC o teléfono…"
            className="max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-muted text-muted text-xs uppercase shadow-sm">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">DNI / RUC</th>
                <th className="px-4 py-3">Nombre / Razón Social</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-center">Precios</th>
                <th className="px-4 py-3 text-right">Deuda Actual</th>
                <th className="px-4 py-3 text-right">Límite Crédito</th>
                <th className="px-4 py-3 text-right">Crédito Disponible</th>
                <th className="px-4 py-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-line">
              {clientesFiltrados.map(c => (
                <tr key={c.id} className="hover:bg-surface-muted border-b border-line">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.type === 'EMPRESA' ? 'bg-info-soft text-info' : 'bg-info-soft text-info'}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{c.doc}</td>
                  <td className="px-4 py-3 font-bold text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-xs">{c.phone || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => togglePriceList(c)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        c.priceList === 'WHOLESALE'
                          ? 'bg-info-soft text-info border-info/30'
                          : 'bg-surface-muted text-ink-soft border-line'
                      }`}
                      title="Cambiar lista de precios"
                    >
                      {c.priceList === 'WHOLESALE' ? 'Mayorista' : 'Minorista'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-danger">S/ {c.currentDebt.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-soft">S/ {c.maxCredit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-black text-success">S/ {c.availableCredit.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-xs bg-surface-muted hover:bg-line text-ink-soft font-bold px-2.5 py-1 rounded shadow-sm whitespace-nowrap"
                        title="Editar datos del cliente"
                      >
                        <i className="fa-solid fa-pen mr-1"></i> Editar
                      </button>
                      <button
                        onClick={() => openCredit(c)}
                        className="text-xs bg-surface-muted hover:bg-line text-ink-soft font-bold px-2.5 py-1 rounded shadow-sm whitespace-nowrap"
                        title="Editar límite de crédito"
                      >
                        <i className="fa-solid fa-hand-holding-dollar mr-1"></i> Crédito
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clientesFiltrados.length === 0 && (
            <EmptyState
              icon="fa-users"
              title={clients.length === 0 ? 'Todavía no hay clientes' : 'Ningún cliente coincide'}
              description={clients.length === 0
                ? 'Registre a sus clientes para llevarles el crédito y su historial de compras.'
                : 'Pruebe con el nombre, el documento o el teléfono.'}
            />
          )}
        </div>
      </div>

      {/* Registrar o editar cliente */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editing ? 'Editar cliente' : 'Registrar cliente'}
        icon={editing ? 'fa-user-pen' : 'fa-user-plus'}
        footer={(
          <>
            <Button onClick={closeModal} disabled={loading}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveClient} loading={loading}>
              {editing ? 'Guardar cambios' : 'Guardar cliente'}
            </Button>
          </>
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Tipo Cliente</label>
              <select
                value={cliType}
                onChange={e => { setCliType(e.target.value); clearError('doc'); }}
                className="w-full border border-line p-2 rounded outline-none focus:border-brand bg-surface text-sm"
              >
                <option value="Natural">Persona Natural</option>
                <option value="Empresa">Empresa (RUC)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">DNI / RUC</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={cliDoc}
                onChange={e => { setCliDoc(e.target.value.replace(/\D/g, '')); clearError('doc'); }}
                className={`w-full border p-2 rounded outline-none text-sm font-medium ${borderClass(errors.doc)}`}
              />
              <FieldError msg={errors.doc} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Nombre / Razón Social</label>
            <input
              type="text"
              maxLength={120}
              value={cliName}
              onChange={e => { setCliName(e.target.value); clearError('name'); }}
              className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.name)}`}
            />
            <FieldError msg={errors.name} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Teléfono</label>
              <input
                type="text"
                inputMode="tel"
                maxLength={15}
                value={cliPhone}
                onChange={e => { setCliPhone(e.target.value); clearError('phone'); }}
                className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.phone)}`}
              />
              <FieldError msg={errors.phone} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted mb-1 block">Correo</label>
              <input
                type="email"
                maxLength={120}
                value={cliEmail}
                onChange={e => { setCliEmail(e.target.value); clearError('email'); }}
                className={`w-full border p-2 rounded outline-none text-sm ${borderClass(errors.email)}`}
              />
              <FieldError msg={errors.email} />
            </div>
            {!editing && (
              <>
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Límite de Crédito (S/)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={maxCredit}
                    onChange={e => { setMaxCredit(e.target.value); clearError('maxCredit'); }}
                    className={`w-full border p-2 rounded outline-none text-sm font-bold ${borderClass(errors.maxCredit)}`}
                  />
                  <FieldError msg={errors.maxCredit} />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted mb-1 block">Lista de precios</label>
                  <select
                    value={priceList}
                    onChange={e => setPriceList(e.target.value)}
                    className="w-full border border-line p-2 rounded outline-none text-sm bg-surface"
                  >
                    <option value="RETAIL">Minorista</option>
                    <option value="WHOLESALE">Mayorista</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-muted mb-1 block">Dirección</label>
            <input
              type="text"
              maxLength={200}
              value={cliAddress}
              onChange={e => setCliAddress(e.target.value)}
              className="w-full border border-line p-2 rounded outline-none focus:border-brand text-sm"
            />
          </div>
          {editing && (
            <p className="text-[11px] text-muted">
              El límite de crédito y la lista de precios se cambian desde los botones de la tabla.
            </p>
          )}
        </div>
      </Modal>

      {/* Límite de crédito */}
      <Modal
        open={Boolean(creditTarget)}
        onClose={() => !loading && setCreditTarget(null)}
        title="Límite de crédito"
        description={creditTarget?.name}
        icon="fa-hand-holding-dollar"
        size="sm"
        footer={(
          <>
            <Button onClick={() => setCreditTarget(null)} disabled={loading}>Cancelar</Button>
            <Button variant="primary" onClick={handleSaveCredit} loading={loading}>Guardar</Button>
          </>
        )}
      >
        {creditTarget && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-surface-muted rounded-lg p-2.5">
                <p className="text-muted">Deuda actual</p>
                <p className="font-bold text-danger text-sm">S/ {creditTarget.currentDebt.toFixed(2)}</p>
              </div>
              <div className="bg-surface-muted rounded-lg p-2.5">
                <p className="text-muted">Límite actual</p>
                <p className="font-bold text-ink text-sm">S/ {creditTarget.maxCredit.toFixed(2)}</p>
              </div>
            </div>
            <Field label="Nuevo límite (S/)" error={creditError}>
              <Input
                type="number"
                min="0"
                step="10"
                autoFocus
                value={creditValue}
                error={creditError}
                onChange={e => { setCreditValue(e.target.value); setCreditError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSaveCredit()}
                className="font-bold"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
