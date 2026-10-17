/**
 * Maps technical database/RPC errors to user-friendly Spanish messages.
 * Always log the original error to console for debugging.
 */

const ERROR_PATTERNS: [RegExp, string][] = [
  // FK constraint violations
  [/violates foreign key constraint/i, "Este registro tiene datos vinculados (contratos, pallets, movimientos, etc.). Elimínelos primero antes de continuar."],
  [/update or delete on table "clients".*violates/i, "No se puede eliminar este cliente porque tiene contratos, pallets u otros registros vinculados. Elimine primero los registros dependientes."],
  [/update or delete on table "contracts".*violates/i, "No se puede eliminar este contrato porque tiene pallets o movimientos vinculados. Retire los pallets primero."],
  
  // Position not free (from RPCs)
  [/Position .* is not free/i, "La posición seleccionada ya está ocupada o bloqueada. Seleccione otra posición."],
  [/Target position .* is not free/i, "La posición destino ya está ocupada o bloqueada. Seleccione otra posición."],
  
  // Pallet not found
  [/Pallet not found/i, "El pallet no fue encontrado. Puede haber sido eliminado o expedido."],
  
  // RPC validation errors (from server-side — Block 2)
  [/Peso debe ser mayor a cero/i, "El peso debe ser mayor a cero."],
  [/SKU es obligatorio/i, "El código SKU es obligatorio."],
  [/Descripción es obligatoria/i, "La descripción del producto es obligatoria."],
  [/Contrato no está activo/i, "El contrato seleccionado no está activo. Solo se permiten operaciones en contratos con estado 'Activo'."],
  [/Contrato sin posiciones disponibles/i, "El contrato no tiene posiciones disponibles. Aumente las posiciones contratadas o libere espacio."],
  [/Cliente no coincide con el contrato/i, "El cliente seleccionado no coincide con el titular del contrato."],
  [/Este pallet ya fue expedido/i, "Este pallet ya fue expedido y no puede ser procesado nuevamente."],
  [/Peso final no puede ser negativo/i, "El peso final no puede ser un valor negativo."],
  [/Solo pallets almacenados pueden transferirse/i, "Solo pallets con estado 'Almacenado' pueden ser transferidos."],
  [/La posición destino es la misma que la actual/i, "La posición destino es la misma que la posición actual. Seleccione una posición diferente."],
  
  // RLS / permissions
  [/row-level security/i, "No tiene permiso para realizar esta acción. Contacte al administrador."],
  [/new row violates row-level security/i, "No tiene permiso para crear este registro. Verifique su rol de acceso."],
  [/insufficient_privilege/i, "Permiso insuficiente para esta operación."],
  
  // Duplicate key
  [/duplicate key/i, "Ya existe un registro con estos datos. Verifique y corrija la información."],
  [/unique constraint/i, "Ya existe un registro con estos datos. Verifique y corrija la información."],
  
  // Not null violation
  [/not-null constraint/i, "Faltan campos obligatorios. Complete todos los campos requeridos."],
  [/null value in column/i, "Faltan campos obligatorios. Complete todos los campos requeridos."],
  
  // Storage errors
  [/Archivo muy grande/i, "El archivo es demasiado grande. El tamaño máximo permitido es 5MB."],
  [/Tipo no permitido/i, "Tipo de archivo no permitido. Use imágenes (JPG, PNG, WebP) o PDF."],
  [/Error al subir archivo/i, "Error al subir el archivo. Intente nuevamente."],
  
  // Network/connection
  [/fetch|network|timeout|ECONNREFUSED/i, "Error de conexión. Verifique su conexión a internet e intente nuevamente."],
];

export function parseDbError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  
  // Log technical details for debugging
  console.error("Technical error:", error);
  
  for (const [pattern, friendlyMessage] of ERROR_PATTERNS) {
    if (pattern.test(msg)) {
      return friendlyMessage;
    }
  }
  
  // If the message is already in Spanish and looks user-friendly (from our RPCs), return as-is
  if (/^[A-ZÁÉÍÓÚÑ]/.test(msg) && msg.length < 200 && !/\b(constraint|violation|row|column|table|schema|function)\b/i.test(msg)) {
    return msg;
  }
  
  return "Ocurrió un error inesperado. Intente nuevamente o contacte al administrador.";
}
