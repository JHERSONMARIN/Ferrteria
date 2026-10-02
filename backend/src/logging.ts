import { installConsoleLogger } from '@ferresys/shared/logger';

// Registro estructurado desde el primer mensaje: server.js importa este archivo antes que todo lo demás,
// para que también lo que escriban los otros módulos al cargarse salga en JSON.
installConsoleLogger({ service: 'backend' });
