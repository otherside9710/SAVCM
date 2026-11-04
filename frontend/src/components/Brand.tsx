type BrandProps = { className?: string };

/** Shared SAVCM mark and wordmark used across the app. */
export function Brand({ className = '' }: BrandProps) {
  return <span className={`brand ${className}`.trim()}>
    <span className="brand-mark" aria-hidden="true">
      <img src="/savcm-mark.svg" alt="" />
    </span>
    <span className="brand-copy">
      <span className="brand-name">SAVCM</span>
      <span className="brand-caption">CITAS MÉDICAS</span>
    </span>
  </span>;
}
