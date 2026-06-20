// Modelo de dominio: Usuario
// Representa a un usuario registrado en el sistema

export class Usuario {
  constructor(
    public readonly id: string,
    public readonly nombre: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly creadoEn: Date,
  ) {
    if (!id)    throw new Error('El ID es obligatorio.');
    if (!nombre || nombre.trim() === '') throw new Error('El nombre no puede estar vacio.');
    if (!email  || !email.includes('@')) throw new Error('El email no es valido.');
  }
}
