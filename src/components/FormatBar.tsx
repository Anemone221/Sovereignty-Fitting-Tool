interface FormatBarProps<K extends string> {
  keys: readonly K[];
  labels: Record<K, string>;
  values: Record<K, boolean>;
  onChange: (key: K, value: boolean) => void;
}

export function FormatBar<K extends string>({ keys, labels, values, onChange }: FormatBarProps<K>) {
  return (
    <div className="format-bar">
      {keys.map((k) => (
        <label key={k} className="format-bar__option">
          <input
            type="checkbox"
            checked={values[k]}
            onChange={(e) => onChange(k, e.currentTarget.checked)}
          />
          <span>{labels[k]}</span>
        </label>
      ))}
    </div>
  );
}
