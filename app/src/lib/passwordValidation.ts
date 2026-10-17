export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

export function validatePassword(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  const labels: Record<number, string> = {
    0: "Muy débil",
    1: "Débil",
    2: "Regular",
    3: "Buena",
    4: "Fuerte",
    5: "Muy fuerte",
  };

  const colors: Record<number, string> = {
    0: "bg-destructive",
    1: "bg-destructive",
    2: "bg-orange-500",
    3: "bg-yellow-500",
    4: "bg-green-500",
    5: "bg-green-600",
  };

  return { score, label: labels[score], color: colors[score], checks };
}

export function isPasswordValid(password: string): boolean {
  const { checks } = validatePassword(password);
  return checks.minLength && checks.hasUppercase && checks.hasNumber;
}

export function getPasswordErrors(password: string): string[] {
  const { checks } = validatePassword(password);
  const errors: string[] = [];
  if (!checks.minLength) errors.push("Mínimo 8 caracteres");
  if (!checks.hasUppercase) errors.push("Al menos 1 letra mayúscula");
  if (!checks.hasNumber) errors.push("Al menos 1 número");
  return errors;
}
