import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  className?: string;
}

export function Header({ title, subtitle, icon: Icon, actions, className }: HeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pl-12 lg:pl-0",
        className
      )}
    >
      <div className="animate-slide-in min-w-0">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="w-5 h-5 text-text-secondary" strokeWidth={2} />
          )}
          <h1 className="text-[22px] font-semibold text-text-primary tracking-tight leading-tight">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="mt-1 text-text-secondary text-[13px] max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
