import type { StructuredTextLanguage } from '../../lib/structuredText';

type StructuredTextLanguageToggleProps = {
  language: StructuredTextLanguage;
  onLanguageChange?: (language: StructuredTextLanguage) => void;
};

export function StructuredTextLanguageToggle({
  language,
  onLanguageChange,
}: StructuredTextLanguageToggleProps) {
  return (
    <div className="structured-text-editor__lang" role="group" aria-label="Language">
      {(['json', 'yaml'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          className={`structured-text-editor__lang-btn${language === lang ? ' structured-text-editor__lang-btn--active' : ''}`}
          aria-pressed={language === lang}
          disabled={!onLanguageChange}
          onClick={() => onLanguageChange?.(lang)}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
