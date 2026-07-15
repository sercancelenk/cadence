/** 1:1 Mode agenda templates + way-of-working copy. UI-only — no AppData schema. */

export type OneOnOneLang = 'en' | 'tr';

export const ONE_ON_ONE_LANG_STORAGE_KEY = 'cadence.oneOnOne.lang';

export function readOneOnOneLang(): OneOnOneLang {
  try {
    const v = localStorage.getItem(ONE_ON_ONE_LANG_STORAGE_KEY);
    if (v === 'tr' || v === 'en') return v;
  } catch {
    /* private mode / SSR */
  }
  return 'en';
}

export function writeOneOnOneLang(lang: OneOnOneLang): void {
  try {
    localStorage.setItem(ONE_ON_ONE_LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export type OneOnOneRule = { title: string; body: string };

export type OneOnOneWayOfWorking = {
  heading: string;
  intro: string;
  rules: OneOnOneRule[];
  footer: string;
};

const WAY_OF_WORKING: Record<OneOnOneLang, OneOnOneWayOfWorking> = {
  en: {
    heading: '1:1 way of working',
    intro:
      'A 1:1 is a recurring working conversation between two people. It is not a status standup. Treat this agenda as a shared document — both sides can add topics before the meeting.',
    rules: [
      {
        title: 'Balance the conversation',
        body: 'Prefer questions over instant answers. Aim for a two-way exchange; when one person is seeking input, give them most of the airtime.',
      },
      {
        title: 'Keep status elsewhere',
        body: 'Ticket progress and delivery dates belong in standups and the board. Use this time for priorities, development, and friction that is hard to surface elsewhere.',
      },
      {
        title: 'Prepare in advance',
        body: 'Add topics to this agenda ahead of the meeting when you can. A short shared list keeps the session focused.',
      },
      {
        title: 'Speak candidly',
        body: 'Blockers, disagreements, and trade-offs should be discussable. The value of a 1:1 drops if only safe topics appear.',
      },
      {
        title: 'Leave with owners',
        body: 'Capture actions with clear owners. Start the next 1:1 by reviewing open items from the previous session.',
      },
    ],
    footer:
      'Use `- [ ]` for actions. When you archive the meeting, unchecked items carry over to the next agenda.',
  },
  tr: {
    heading: '1:1 çalışma çerçevesi',
    intro:
      '1:1, iki kişi arasında düzenli bir çalışma görüşmesidir. Status toplantısı değildir. Bu gündemi ortak bir doküman gibi kullanın — her iki taraf da toplantıdan önce madde ekleyebilir.',
    rules: [
      {
        title: 'Konuşmayı dengeli tutun',
        body: 'Hemen çözüm önermek yerine soru sorun. Karşılıklı bir alışveriş hedefleyin; bir taraf görüş isterken konuşma süresinin çoğunu ona bırakın.',
      },
      {
        title: 'Status’u burada tutmayın',
        body: 'Ticket ilerlemesi ve teslim tarihleri daily ve board’a aittir. Bu süreyi öncelikler, gelişim ve başka yerde konuşulması zor sürtünmeler için kullanın.',
      },
      {
        title: 'Önceden hazırlanın',
        body: 'Mümkünse maddeleri toplantıdan önce bu gündeme yazın. Kısa ortak bir liste görüşmeyi odaklı tutar.',
      },
      {
        title: 'Açık konuşun',
        body: 'Engeller, fikir ayrılıkları ve trade-off’lar tartışılabilir olmalı. Yalnızca “güvenli” konular kalırsa 1:1 değeri düşer.',
      },
      {
        title: 'Sahipli aksiyonlarla kapatın',
        body: 'Aksiyonları net sahiplerle kaydedin. Bir sonraki 1:1’e önceki açık maddeleri gözden geçirerek başlayın.',
      },
    ],
    footer:
      'Aksiyonlar için `- [ ]` kullanın. Toplantıyı arşivlediğinizde işaretlenmemiş maddeler bir sonraki gündeme taşınır.',
  },
};

export function oneOnOneWayOfWorking(lang: OneOnOneLang): OneOnOneWayOfWorking {
  return WAY_OF_WORKING[lang];
}

/**
 * Starter agenda markdown. `personName` labels the other party’s action line.
 * Neutral wording — suitable for leaders and team members. Pure string;
 * caller decides when to write into Person.agenda.
 */
export function defaultAgenda(personName: string, lang: OneOnOneLang = 'en'): string {
  const name = personName.trim() || (lang === 'tr' ? 'Karşı taraf' : 'Other');
  if (lang === 'tr') {
    return [
      '## Check-in',
      '- ',
      '',
      `## Gündem — ${name}`,
      '- [ ] ',
      '- [ ] ',
      '',
      '## Gündem — ben',
      '- [ ] ',
      '- [ ] ',
      '',
      '## Engeller & destek',
      '- [ ] ',
      '',
      '## Aksiyonlar',
      `- [ ] **Ben:** `,
      `- [ ] **${name}:** `,
      '',
    ].join('\n');
  }
  return [
    '## Check-in',
    '- ',
    '',
    `## Agenda — ${name}`,
    '- [ ] ',
    '- [ ] ',
    '',
    '## Agenda — me',
    '- [ ] ',
    '- [ ] ',
    '',
    '## Blockers & support',
    '- [ ] ',
    '',
    '## Actions',
    `- [ ] **Me:** `,
    `- [ ] **${name}:** `,
    '',
  ].join('\n');
}

export function carryOverHeading(lang: OneOnOneLang): string {
  return lang === 'tr' ? '## Devreden maddeler' : '## Carry-over';
}

/** Pull unchecked checklist lines for the next agenda. */
export function extractCarryOver(agenda: string): string {
  const lines = agenda.split('\n');
  const open = lines.filter((l) => /^\s*-\s*\[\s\]\s*\S/.test(l));
  return open.join('\n').trim();
}
