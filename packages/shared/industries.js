// Rubros del sistema: el núcleo comercial es el mismo y cada rubro es un paquete que lo extiende
// (documento de arquitectura, sección 3.4). Una empresa tiene un solo rubro, que viene en su licencia
// (variable INDUSTRY). Lo leen el backend de las empresas, la consola de VALETEC y deploy/.
export const INDUSTRIES = {
  ferreteria: { nombre: 'Ferretería' },
  farmacia: { nombre: 'Farmacia' },
};

// Empresas creadas antes de los rubros, o sin la variable: ferretería.
export const DEFAULT_INDUSTRY = 'ferreteria';

export const isIndustry = (value) => Object.hasOwn(INDUSTRIES, value);
