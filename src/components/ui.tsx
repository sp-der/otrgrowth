import type { ReactNode } from "react";
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </header>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className={`badge ${children === "Approved" || children === "Ready" || children === "Active" ? "positive" : children === "In review" ? "amber" : ""}`}
    >
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Feedback({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <p
      className={`feedback ${error ? "error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {message}
    </p>
  ) : null;
}
export function DemoNote() {
  return (
    <span className="demo-note">
      <span /> Illustrative data · no live accounts connected
    </span>
  );
}
