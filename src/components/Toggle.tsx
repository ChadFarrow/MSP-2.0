export function Toggle({ checked, onChange, label }: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}) {
  return (
    <div className="toggle-wrapper">
      <div className={`toggle ${checked ? 'active' : ''}`} onClick={() => onChange(!checked)}>
        <div className="toggle-knob" />
      </div>
      {label && <span className="form-label">{label}</span>}
    </div>
  );
}
