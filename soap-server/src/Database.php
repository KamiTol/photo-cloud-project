<?php

require_once __DIR__ . '/Env.php';

final class Database
{
    private static ?PDO $instance = null;

    public static function connection(): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $host = Env::get('DB_HOST', 'localhost');
        $port = Env::get('DB_PORT', '5432');
        $name = Env::get('DB_NAME', 'photo_cloud_db');
        $user = Env::get('DB_USER', 'admin_fotos');
        $pass = Env::get('DB_PASSWORD', '12345678');

        $dsn = "pgsql:host=$host;port=$port;dbname=$name";

        self::$instance = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        self::$instance->exec("SET search_path TO public");

        return self::$instance;
    }
}
