<?php

final class UsuarioFault extends SoapFault
{
    public function __construct(string $codigo, string $mensaje)
    {
        parent::__construct($codigo, $mensaje);
    }
}
