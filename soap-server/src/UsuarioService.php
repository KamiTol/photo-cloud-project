<?php

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/UsuarioFault.php';

/**
 * Servicio SOAP de gestion de usuarios (UPB-Cientifica).
 *
 * Opera sobre la misma tabla `usuarios` de PostgreSQL que usa el backend
 * Node.js (photo-cloud-server), por lo que un usuario creado aqui puede
 * iniciar sesion en el resto del sistema y viceversa. El hash de password
 * usa bcrypt ($2y$), compatible con bcryptjs (formato $2a$/$2b$) via
 * password_verify().
 */
final class UsuarioService
{
    private const CUOTA_DEFECTO_BYTES = 1073741824; // 1 GB

    /**
     * @return array{id:string,nombre:string,email:string,creadoEn:string,cuotaMaximaBytes:int,usoBytes:int}
     */
    public function registrarUsuario(string $nombre, string $email, string $password): array
    {
        $nombre = trim($nombre);
        $email = strtolower(trim($email));

        if ($nombre === '' || $email === '' || strlen($password) < 6) {
            throw new UsuarioFault('DatosInvalidos', 'Nombre, email y password (min 6 caracteres) son obligatorios.');
        }

        $pdo = Database::connection();

        $existente = $pdo->prepare('SELECT id FROM usuarios WHERE email = :email');
        $existente->execute(['email' => $email]);
        if ($existente->fetch() !== false) {
            throw new UsuarioFault('EmailDuplicado', "El email $email ya esta registrado.");
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);

        $stmt = $pdo->prepare(
            'INSERT INTO usuarios (nombre, email, password_hash, cuota_maxima_bytes, uso_bytes)
             VALUES (:nombre, :email, :hash, :cuota, 0)
             RETURNING id, nombre, email, creado_en, cuota_maxima_bytes, uso_bytes'
        );
        $stmt->execute([
            'nombre' => $nombre,
            'email' => $email,
            'hash' => $hash,
            'cuota' => self::CUOTA_DEFECTO_BYTES,
        ]);

        return $this->mapearFila($stmt->fetch());
    }

    /**
     * @return array{id:string,nombre:string,email:string,creadoEn:string,cuotaMaximaBytes:int,usoBytes:int}
     */
    public function autenticarUsuario(string $email, string $password): array
    {
        $email = strtolower(trim($email));

        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, email, password_hash, creado_en, cuota_maxima_bytes, uso_bytes
             FROM usuarios WHERE email = :email'
        );
        $stmt->execute(['email' => $email]);
        $fila = $stmt->fetch();

        if ($fila === false || !password_verify($password, $fila['password_hash'])) {
            throw new UsuarioFault('CredencialesInvalidas', 'Email o password incorrectos.');
        }

        return $this->mapearFila($fila);
    }

    /**
     * @return array{id:string,nombre:string,email:string,creadoEn:string,cuotaMaximaBytes:int,usoBytes:int}
     */
    public function obtenerUsuarioPorEmail(string $email): array
    {
        $email = strtolower(trim($email));

        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, email, creado_en, cuota_maxima_bytes, uso_bytes
             FROM usuarios WHERE email = :email'
        );
        $stmt->execute(['email' => $email]);
        $fila = $stmt->fetch();

        if ($fila === false) {
            throw new UsuarioFault('UsuarioNoEncontrado', "No existe un usuario con email $email.");
        }

        return $this->mapearFila($fila);
    }

    /**
     * @return array{id:string,nombre:string,email:string,creadoEn:string,cuotaMaximaBytes:int,usoBytes:int}
     */
    public function obtenerUsuarioPorId(string $id): array
    {
        $stmt = Database::connection()->prepare(
            'SELECT id, nombre, email, creado_en, cuota_maxima_bytes, uso_bytes
             FROM usuarios WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $fila = $stmt->fetch();

        if ($fila === false) {
            throw new UsuarioFault('UsuarioNoEncontrado', "No existe un usuario con id $id.");
        }

        return $this->mapearFila($fila);
    }

    /**
     * @return array<int, array{id:string,nombre:string,email:string,creadoEn:string,cuotaMaximaBytes:int,usoBytes:int}>
     */
    public function listarUsuarios(): array
    {
        $stmt = Database::connection()->query(
            'SELECT id, nombre, email, creado_en, cuota_maxima_bytes, uso_bytes
             FROM usuarios ORDER BY creado_en DESC'
        );

        return array_map(fn(array $fila) => $this->mapearFila($fila), $stmt->fetchAll());
    }

    public function actualizarCuota(string $id, int $cuotaMaximaBytes): bool
    {
        if ($cuotaMaximaBytes <= 0) {
            throw new UsuarioFault('DatosInvalidos', 'La cuota maxima debe ser mayor a 0.');
        }

        $stmt = Database::connection()->prepare(
            'UPDATE usuarios SET cuota_maxima_bytes = :cuota WHERE id = :id'
        );
        $stmt->execute(['cuota' => $cuotaMaximaBytes, 'id' => $id]);

        if ($stmt->rowCount() === 0) {
            throw new UsuarioFault('UsuarioNoEncontrado', "No existe un usuario con id $id.");
        }

        return true;
    }

    public function eliminarUsuario(string $id): bool
    {
        $stmt = Database::connection()->prepare('DELETE FROM usuarios WHERE id = :id');
        $stmt->execute(['id' => $id]);

        if ($stmt->rowCount() === 0) {
            throw new UsuarioFault('UsuarioNoEncontrado', "No existe un usuario con id $id.");
        }

        return true;
    }

    public function existeEmail(string $email): bool
    {
        $stmt = Database::connection()->prepare('SELECT 1 FROM usuarios WHERE email = :email');
        $stmt->execute(['email' => strtolower(trim($email))]);

        return $stmt->fetch() !== false;
    }

    private function mapearFila(array $fila): array
    {
        return [
            'id' => $fila['id'],
            'nombre' => $fila['nombre'],
            'email' => $fila['email'],
            'creadoEn' => (new DateTime($fila['creado_en']))->format(DateTime::ATOM),
            'cuotaMaximaBytes' => (int) $fila['cuota_maxima_bytes'],
            'usoBytes' => (int) $fila['uso_bytes'],
        ];
    }
}
