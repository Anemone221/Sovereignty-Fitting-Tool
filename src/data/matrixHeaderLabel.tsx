import type { ReactNode } from 'react';

export function renderHeaderLabel(label: string, vertical: boolean): ReactNode {
  if (vertical) return label;
  const parts = label.split(/\s+/);
  if (parts.length < 2) return label;
  const head = parts.slice(0, -1).join(' ');
  const tail = parts[parts.length - 1];
  return (
    <>
      <span className="matrix__col-text-line">{head}</span>
      <span className="matrix__col-text-line">{tail}</span>
    </>
  );
}
