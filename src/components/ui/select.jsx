import React from "react";

export function Select({ value, onValueChange, children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function SelectTrigger({ children, className = "" }) {
  return <button className={className}>{children}</button>;
}

export function SelectValue({ children }) {
  return <span>{children}</span>;
}

export function SelectContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function SelectItem({ value, children, className = "", onSelect }) {
  return (
    <div className={`px-2 py-1 cursor-pointer ${className}`} onClick={() => onSelect && onSelect(value)}>
      {children}
    </div>
  );
}

