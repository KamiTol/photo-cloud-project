import * as soap from 'soap';
import {
  IUsuarioIdentidadServicio,
  IdentidadUsuario,
} from '../../../../application/ports/output/usuario-identidad-servicio.interface';

/**
 * Adaptador que consume el servicio SOAP de gestion de usuarios (soap-server/,
 * PHP) como un servicio externo, exactamente como lo plantea la Ilustracion 1:
 * el backend Node.js no gestiona credenciales directamente, delega esa
 * responsabilidad a un servidor SOAP que puede vivir en otra maquina del CCA.
 *
 * El WSDL se resuelve una sola vez (createClientAsync) y el cliente se
 * reutiliza entre llamadas. Si SOAP_ENDPOINT_URL esta definido, sobreescribe
 * la direccion publicada en el WSDL (util cuando el WSDL fue generado con un
 * "localhost" pero el servidor real esta en otra maquina/puerto).
 */
export class SoapUsuarioClient implements IUsuarioIdentidadServicio {
  private clientPromise: Promise<soap.Client> | null = null;

  constructor(
    private readonly wsdlUrl: string,
    private readonly endpointUrl?: string,
  ) {}

  private async obtenerCliente(): Promise<soap.Client> {
    if (!this.clientPromise) {
      this.clientPromise = soap.createClientAsync(this.wsdlUrl).then((client) => {
        if (this.endpointUrl) client.setEndpoint(this.endpointUrl);
        return client;
      });
      // Si la resolucion del WSDL falla (servicio caido), no dejar el
      // cliente envenenado para siempre: la siguiente llamada debe reintentar.
      this.clientPromise.catch(() => { this.clientPromise = null; });
    }
    return this.clientPromise;
  }

  async registrar(nombre: string, email: string, password: string): Promise<IdentidadUsuario> {
    try {
      const client = await this.obtenerCliente();
      const [result] = await client.registrarUsuarioAsync({ nombre, email, password });
      return this.mapearUsuario(result.return);
    } catch (error) {
      throw this.mapearError(error);
    }
  }

  async autenticar(email: string, password: string): Promise<IdentidadUsuario> {
    try {
      const client = await this.obtenerCliente();
      const [result] = await client.autenticarUsuarioAsync({ email, password });
      return this.mapearUsuario(result.return);
    } catch (error) {
      throw this.mapearError(error);
    }
  }

  /**
   * El binding rpc/encoded del WSDL hace que la libreria `soap` devuelva
   * cada campo escalar envuelto como { attributes: { xsi:type }, $value }
   * en lugar del valor plano. Se desempaqueta aqui.
   */
  private desempaquetar(valor: any): string {
    return valor && typeof valor === 'object' && '$value' in valor ? valor.$value : valor;
  }

  private mapearUsuario(usuario: any): IdentidadUsuario {
    return {
      id: this.desempaquetar(usuario.id),
      nombre: this.desempaquetar(usuario.nombre),
      email: this.desempaquetar(usuario.email),
    };
  }

  private mapearError(error: any): Error {
    // SoapFault: error.root.Envelope.Body.Fault.faultcode / faultstring
    const fault = error?.root?.Envelope?.Body?.Fault;
    if (fault?.faultstring) {
      return new Error(fault.faultstring);
    }
    if (error?.code === 'ECONNREFUSED' || error?.message?.includes('ECONNREFUSED')) {
      return new Error('El servicio de gestion de usuarios (SOAP) no esta disponible.');
    }
    return error instanceof Error ? error : new Error('Error desconocido en el servicio SOAP de usuarios.');
  }
}
