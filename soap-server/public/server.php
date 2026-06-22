<?php

require_once __DIR__ . '/../src/Env.php';
require_once __DIR__ . '/../src/UsuarioService.php';

Env::load(__DIR__ . '/../.env');

ini_set('soap.wsdl_cache_enabled', '0');

$wsdl = __DIR__ . '/usuarios.wsdl';

$server = new SoapServer($wsdl, [
    'cache_wsdl' => WSDL_CACHE_NONE,
]);

$server->setClass(UsuarioService::class);

try {
    $server->handle();
} catch (Throwable $e) {
    http_response_code(500);
    error_log('[soap-server] Error no controlado: ' . $e->getMessage());
}
