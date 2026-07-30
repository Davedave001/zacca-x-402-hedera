import type { ReactNode } from "react";

interface SectionHeaderProps {
  number: string;
  label: string;
  title: string;
  children?: ReactNode;
}

/** eduba.io's exact two-column section header: number/slash/label on the left, title + description on the right. */
export function SectionHeader({ number, label, title, children }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-meta">
        <span>{number}</span>
        <span className="slash">/</span>
        <span>{label}</span>
      </div>
      <div className="section-info">
        <h2 className="section-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
