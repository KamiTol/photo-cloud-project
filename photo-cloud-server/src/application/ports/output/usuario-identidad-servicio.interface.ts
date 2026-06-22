export interface IdentidadUsuario {
  id: string;
  nombre: string;
  email: string;
}

/**
 * Puerto hacia el servicio externo de gestion de identidad de usuarios
 * (SOAP Server PHP Users, segun la Ilustracion 1 del proyecto de aula).
 *
 * Quien implemente este puerto es responsable de la fuente de verdad de
 * "quien es quien" (registro, credenciales). Las cuotas y la propiedad de
 * archivos siguen residiendo en IUsuarioRepository, porque son un concepto
 * del dominio Shared File, no de gestion de identidad.
 */
export interface IUsuarioIdentidadServicio {
  registrar(nombre: string, email: string, password: string): Promise<IdentidadUsuario>;
  autenticar(email: string, password: string): Promise<IdentidadUsuario>;
}
