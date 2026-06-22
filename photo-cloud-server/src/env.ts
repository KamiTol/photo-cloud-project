import dotenv from 'dotenv';

// override: true porque el .env del proyecto debe tener prioridad sobre
// variables de entorno preexistentes del sistema operativo (p. ej. variables
// genericas como DB_PASSWORD definidas fuera de este proyecto en la maquina).
dotenv.config({ override: true });
