import { IcHelpCircle } from '../../components/icons';
import { AppModal } from '../../components/ui/AppModal';
import {
  oneOnOneWayOfWorking,
  writeOneOnOneLang,
  type OneOnOneLang,
} from '../../lib/people/oneOnOneAgenda';

export type OneOnOneHelpDialogProps = {
  lang: OneOnOneLang;
  onLangChange: (lang: OneOnOneLang) => void;
  onClose: () => void;
};

/** Way-of-working guide for 1:1 Mode (EN + TR). Does not write AppData. */
export function OneOnOneHelpDialog({ lang, onLangChange, onClose }: OneOnOneHelpDialogProps) {
  const copy = oneOnOneWayOfWorking(lang);

  const setLang = (next: OneOnOneLang) => {
    writeOneOnOneLang(next);
    onLangChange(next);
  };

  return (
    <AppModal
      title={copy.heading}
      icon={<IcHelpCircle size={18} />}
      onClose={onClose}
      size="lg"
      layout="flex"
      showCloseButton
      bodyClassName="ai-dialog__scroll one-on-one-help"
      footer={
        <div className="app-modal__actions">
          <button type="button" className="app-modal__btn-confirm" onClick={onClose}>
            {lang === 'tr' ? 'Tamam' : 'Done'}
          </button>
        </div>
      }
    >
      <div className="one-on-one-help__lang" role="group" aria-label={lang === 'tr' ? 'Dil' : 'Language'}>
        <button
          type="button"
          className={`one-on-one-help__lang-btn${lang === 'en' ? ' is-active' : ''}`}
          aria-pressed={lang === 'en'}
          onClick={() => setLang('en')}
        >
          EN
        </button>
        <button
          type="button"
          className={`one-on-one-help__lang-btn${lang === 'tr' ? ' is-active' : ''}`}
          aria-pressed={lang === 'tr'}
          onClick={() => setLang('tr')}
        >
          TR
        </button>
      </div>

      <p className="one-on-one-help__intro">{copy.intro}</p>

      <ol className="one-on-one-help__rules">
        {copy.rules.map((rule) => (
          <li key={rule.title}>
            <strong>{rule.title}</strong>
            <p>{rule.body}</p>
          </li>
        ))}
      </ol>

      <p className="one-on-one-help__footer muted small">{copy.footer}</p>
    </AppModal>
  );
}
