// Missing Blue logo mark (two offset blocks), traced from the official logo. Fills with currentColor.
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 355 605" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M0 98 110 173V295L221 375V605L0 420Z" />
      <path fill="currentColor" d="M157 0 355 137V505L257 435V335L157 260Z" />
    </svg>
  );
}
