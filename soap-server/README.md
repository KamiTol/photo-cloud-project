# soap-server — Gestión de usuarios (SOAP / PHP)

Servicio SOAP en PHP que implementa el componente **"SOAP Server PHP Users"** del diagrama de arquitectura (Ilustración 1) exigido por el proyecto de aula. Gestiona el ciclo de vida de los usuarios: registro, autenticación, consulta, cuotas y borrado.

No es un servicio aislado: opera sobre la **misma tabla `usuarios` de PostgreSQL** que usa `photo-cloud-server` (Node.js). Un usuario registrado por SOAP puede iniciar sesión en el cliente web y viceversa, porque ambos usan `password_hash`/`password_verify` de PHP (bcrypt, prefijo `$2y$`) y `bcryptjs` de Node (`$2a$`/`$2b$`), que son compatibles entre sí (mismo algoritmo bcrypt).

## Arquitectura

```
[Cliente SOAP] ──SOAP/HTTP──► server.php ──► UsuarioService ──► PostgreSQL (tabla usuarios)
                                                                  │
                                                    (misma BD que photo-cloud-server)
```

## Requisitos

- PHP 8.1+ con las extensiones:
  - `soap`
  - `pdo_pgsql`
- PostgreSQL ya inicializado con las migraciones de `database/` (`01-init-schema.sql` a `04-permisos.sql`).

### Activar extensiones en Windows

Edita `php.ini` (ubícalo con `php --ini`) y descomenta/agrega:

```ini
extension=soap
extension=pdo_pgsql
```

Verifica con:

```powershell
php -m | Select-String "soap|pdo_pgsql"
```

## Configuración

```powershell
cd soap-server
Copy-Item .env.example .env
notepad .env
```

Usa las mismas credenciales que `photo-cloud-server/.env` (mismo host/puerto/usuario/base de datos), ya que comparten esquema.

## Ejecutar el servidor

```powershell
cd soap-server
php -S localhost:8080 -t public
```

- WSDL: http://localhost:8080/usuarios.wsdl
- Endpoint SOAP: http://localhost:8080/server.php

## Probar con el cliente de ejemplo

En otra terminal, con el servidor corriendo:

```powershell
cd soap-server
php client_test.php
```

Esto registra un usuario de prueba, lo autentica, actualiza su cuota, lo lista y lo elimina, usando exclusivamente operaciones SOAP.

## Operaciones expuestas

| Operación | Parámetros | Retorna | Descripción |
|---|---|---|---|
| `registrarUsuario` | nombre, email, password | `Usuario` | Crea un usuario (password hasheado con bcrypt) |
| `autenticarUsuario` | email, password | `Usuario` | Verifica credenciales, lanza `SoapFault` si fallan |
| `obtenerUsuarioPorEmail` | email | `Usuario` | Busca por email |
| `obtenerUsuarioPorId` | id | `Usuario` | Busca por UUID |
| `listarUsuarios` | — | `ArrayOfUsuario` | Lista todos los usuarios |
| `actualizarCuota` | id, cuotaMaximaBytes | boolean | Cambia la cuota máxima de almacenamiento |
| `eliminarUsuario` | id | boolean | Elimina un usuario |
| `existeEmail` | email | boolean | Verifica si un email ya está registrado |

## Errores (SoapFault)

| Código | Cuándo ocurre |
|---|---|
| `DatosInvalidos` | Campos vacíos o password < 6 caracteres |
| `EmailDuplicado` | El email ya existe al registrar |
| `CredencialesInvalidas` | Login con email/password incorrectos |
| `UsuarioNoEncontrado` | Operación sobre un id/email que no existe |

## Integración con el resto del sistema

Este servicio **es consumido en vivo** por `photo-cloud-server` (Node.js), no solo comparte esquema:

- `POST /api/auth/register` y `POST /api/auth/login` del backend Node ya **no** leen ni escriben `password_hash` directamente. Delegan en este servicio SOAP a través de [`SoapUsuarioClient`](../photo-cloud-server/src/infrastructure/adapters/output/soap/soap-usuario.client.ts), que llama por red a `registrarUsuario` / `autenticarUsuario` (HTTP, como a una máquina/servicio externo — configurable con `SOAP_WSDL_URL` y `SOAP_ENDPOINT_URL` en el `.env` de `photo-cloud-server`).
- Node solo conserva localmente lo que **no** es gestión de identidad: cuotas de almacenamiento (`uso_bytes`), búsquedas por id/email para compartir archivos y propiedad de medios — porque eso es del dominio Shared File, no de usuarios.
- **Base de datos compartida**: este servicio inserta directamente en la tabla `usuarios` (PostgreSQL); Node solo la lee para cuotas/propiedad. Una única fuente de verdad para credenciales.
- **Compatibilidad de hashing**: bcrypt es el algoritmo común entre PHP (`password_hash`) y Node (`bcryptjs`), por si en el futuro algún flujo necesita verificar localmente.
- **Rol en el diagrama**: corresponde al bloque "SOAP Server PHP Users" dentro de "App Servers", consumido como servicio externo (puede vivir en otra máquina del CCA) para la gestión de usuarios, en paralelo a los servidores RMI/Java, Web/JS y gRPC/Go ya existentes.

### Nota de despliegue (servicio en otra máquina)

El WSDL publica `soap:address location="http://localhost:8080/server.php"`. Si este servicio corre en una máquina distinta a `photo-cloud-server` (como exige el PDF al tratarlo como un servidor aparte), ajusta en el `.env` de Node:

```
SOAP_WSDL_URL=http://IP-DEL-SERVIDOR-SOAP:8080/usuarios.wsdl
SOAP_ENDPOINT_URL=http://IP-DEL-SERVIDOR-SOAP:8080/server.php
```

`SOAP_ENDPOINT_URL` sobreescribe la dirección publicada en el WSDL (que puede haber quedado fija a `localhost` al generarse), sin tener que editar el archivo `.wsdl`.
