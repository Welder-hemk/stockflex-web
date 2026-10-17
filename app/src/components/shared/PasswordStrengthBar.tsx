import { validatePassword } from "@/lib/passwordValidation";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  password: string;
}

export default function PasswordStrengthBar({ password }: Props) {
  if (!password) return null;

  const { score, label, checks } = validatePassword(password);

  const barColors = [
    score >= 1 ? (score <= 2 ? "bg-destructive" : score <= 3 ? "bg-yellow-500" : "bg-green-500") : "bg-muted",
    score >= 2 ? (score <= 2 ? "bg-orange-500" : score <= 3 ? "bg-yellow-500" : "bg-green-500") : "bg-muted",
    score >= 3 ? (score <= 3 ? "bg-yellow-500" : "bg-green-500") : "bg-muted",
    score >= 4 ? "bg-green-500" : "bg-muted",
    score >= 5 ? "bg-green-600" : "bg-muted",
  ];

  const requirements = [
    { met: checks.minLength, label: "8+ caracteres" },
    { met: checks.hasUppercase, label: "Mayúscula" },
    { met: checks.hasLowercase, label: "Minúscula" },
    { met: checks.hasNumber, label: "Número" },
    { met: checks.hasSpecial, label: "Carácter especial" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {barColors.map((color, i) => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", color)} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Fortaleza: <span className="font-medium text-foreground">{label}</span>
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {requirements.map((req) => (
          <div key={req.label} className="flex items-center gap-1.5 text-[11px]">
            {req.met ? (
              <Check className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <X className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className={req.met ? "text-foreground" : "text-muted-foreground"}>{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
