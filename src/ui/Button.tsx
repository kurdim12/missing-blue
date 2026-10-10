// <Button variant="primary" onClick={...}>Triage with AI</Button>   ·   <Button href="#/spot/W7">Open W7</Button>
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
  target?: string;
  icon?: ReactNode;
  block?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "secondary", size = "md", href, target, icon, block, className = "", children, ...rest }: Props) {
  const cls = `btn btn-${variant} btn-${size}${block ? " btn-block" : ""} ${className}`;
  const inner = (
    <>
      {icon ? (
        <span className="btn-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </>
  );
  if (href)
    return (
      <a className={cls} href={href} target={target} rel={target === "_blank" ? "noopener noreferrer" : undefined}>
        {inner}
      </a>
    );
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}
