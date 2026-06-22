<?php

/**
 * Cliente de prueba del servicio SOAP de usuarios.
 * Uso: php client_test.php
 */

$wsdl = 'http://localhost:8080/usuarios.wsdl';

$client = new SoapClient($wsdl, [
    'cache_wsdl' => WSDL_CACHE_NONE,
    'exceptions' => true,
]);

$email = 'soap.test+' . time() . '@upbcientifica.test';

echo "== registrarUsuario ==\n";
$usuario = $client->registrarUsuario('Usuario SOAP', $email, 'clave12345');
print_r($usuario);

echo "\n== autenticarUsuario ==\n";
$autenticado = $client->autenticarUsuario($email, 'clave12345');
print_r($autenticado);

echo "\n== existeEmail ==\n";
var_dump($client->existeEmail($email));

echo "\n== obtenerUsuarioPorEmail ==\n";
print_r($client->obtenerUsuarioPorEmail($email));

echo "\n== actualizarCuota ==\n";
var_dump($client->actualizarCuota($usuario->id, 2147483648));

echo "\n== listarUsuarios (primeros 3) ==\n";
$todos = $client->listarUsuarios();
$lista = is_array($todos->usuario ?? null) ? $todos->usuario : [$todos->usuario];
print_r(array_slice($lista, 0, 3));

echo "\n== eliminarUsuario (limpieza) ==\n";
var_dump($client->eliminarUsuario($usuario->id));
