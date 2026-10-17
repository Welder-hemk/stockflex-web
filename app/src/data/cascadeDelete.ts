// No-op: cascade delete now handled by DB foreign keys with ON DELETE CASCADE
// Kept for backward compatibility

export function deleteContractCascade(_contractId: string) {
  console.warn("deleteContractCascade: use dbDeleteContract instead");
}

export function deleteClientCascade(_clientId: string) {
  console.warn("deleteClientCascade: use dbDeleteClient instead");
}
