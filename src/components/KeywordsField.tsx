import { ID3V1_GENRES } from '../data/id3v1Genres';

interface KeywordsFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function parseKeywords(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function serializeKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

export function KeywordsField({ value, onChange, placeholder }: KeywordsFieldProps) {
  const keywords = parseKeywords(value);

  const removeKeyword = (index: number) => {
    onChange(serializeKeywords(keywords.filter((_, i) => i !== index)));
  };

  const addKeyword = (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    if (keywords.some(k => k.toLowerCase() === trimmed.toLowerCase())) return;
    onChange(serializeKeywords([...keywords, trimmed]));
  };

  return (
    <>
      {keywords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {keywords.map((kw, i) => (
            <span
              key={`${kw}-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-tertiary)',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
              }}
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(i)}
                aria-label={`Remove ${kw}`}
                title={`Remove ${kw}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '14px',
                  lineHeight: 1,
                }}
              >
                &#10005;
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          className="form-input"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <select
          className="form-select"
          value=""
          onChange={e => {
            if (e.target.value) addKeyword(e.target.value);
          }}
          style={{ minWidth: '150px' }}
          aria-label="Add ID3v1 genre"
        >
          <option value="">+ Add genre</option>
          {ID3V1_GENRES.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
    </>
  );
}
