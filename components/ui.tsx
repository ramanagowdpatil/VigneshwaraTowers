"use client";

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4">
      {(title || actions) && (
        <div className="flex items-center justify-between mb-2.5 gap-2">
          {title && (
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-slate-900">{children}</h1>
      {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-50 disabled:text-slate-400";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-white text-red-600 border border-red-300 hover:bg-red-50",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-lg px-3.5 py-1.5 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

export const thCls =
  "text-left font-medium text-slate-500 px-4 sm:px-3 py-1.5 border-b border-slate-200 whitespace-nowrap";
export const tdCls =
  "px-4 sm:px-3 py-1 border-b border-slate-100 whitespace-nowrap";

export function AccessDenied() {
  return (
    <Card>
      <p className="text-sm text-slate-500">
        You don&apos;t have access to this page. Contact the administrator if
        you think this is a mistake.
      </p>
    </Card>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      className={`text-sm rounded-lg p-2.5 ${
        kind === "success"
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {children}
    </p>
  );
}
