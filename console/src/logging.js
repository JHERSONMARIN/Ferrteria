import { installConsoleLogger } from '@ferresys/shared/logger';

// Registro estructurado desde el primer mensaje: server.js importa este archivo antes que todo lo demás.
installConsoleLogger({ service: 'consola' });
