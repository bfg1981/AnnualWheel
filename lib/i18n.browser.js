// Generated from translations/*.po. Do not edit directly.
(() => {
  const catalogues = {
  "en-GB": {
    "Annual wheel": "Annual wheel",
    "Annual wheel, home": "Annual wheel, home",
    "Selected year": "Selected year",
    "Previous year": "Previous year",
    "Next year": "Next year",
    "Open account": "Open account",
    "Annual plan": "Annual plan",
    "Filter layers": "Filter layers",
    "Key dates": "Key dates",
    "Display date": "Display date",
    "Date at the top of the wheel": "Date at the top of the wheel",
    "Within {count} days": "Within {count} days",
    "{organisation} · key dates": "{organisation} · key dates",
    "Assumptions": "Assumptions",
    "View all deadlines": "View all deadlines",
    "Today": "Today",
    "Zoom annual wheel": "Zoom annual wheel",
    "Zoom out": "Zoom out",
    "Zoom in": "Zoom in",
    "Recurring rhythm": "Recurring rhythm",
    "a new cycle every year": "a new cycle every year",
    "Drag the wheel to browse the year · select a marker to see the deadline": "Drag the wheel to browse the year · select a marker to see the deadline",
    "More about {title}": "More about {title}",
    "Tentative": "Tentative",
    "Set": "Set",
    "Anchor date": "Anchor date",
    "Set date": "Set date",
    "Depends on anchor": "Depends on anchor",
    "Depends on set anchor": "Depends on set anchor",
    "{count} course days": "{count} course days",
    "Rendering mode": "Rendering mode",
    "Year by year": "Year by year",
    "Continuous": "Continuous",
    "Continuous mode: dates enter at the top and leave beneath the lower cut.": "Continuous mode: dates enter at the top and leave beneath the lower cut."
  },
  "nb-NO": {
    "Annual wheel": "Årshjul",
    "Annual wheel, home": "Årshjul, forsiden",
    "Selected year": "Valgt år",
    "Previous year": "Forrige år",
    "Next year": "Neste år",
    "Open account": "Åpne konto",
    "Annual plan": "Sesongplan",
    "Filter layers": "Filtrer lag",
    "Key dates": "Nøkkeldatoer",
    "Display date": "Visningsdato",
    "Date at the top of the wheel": "Datoen øverst i hjulet",
    "Within {count} days": "Innenfor {count} dager",
    "{organisation} · key dates": "{organisation} · nøkkeldatoer",
    "Assumptions": "Forutsetninger",
    "View all deadlines": "Se alle frister",
    "Today": "I dag",
    "Zoom annual wheel": "Zoom i årshjulet",
    "Zoom out": "Zoom ut",
    "Zoom in": "Zoom inn",
    "Recurring rhythm": "Gjentakende rytme",
    "a new cycle every year": "en ny runde hvert år",
    "Drag the wheel to browse the year · select a marker to see the deadline": "Dra hjulet for å bla i året · trykk på en markør for å se fristen",
    "More about {title}": "Mer om {title}",
    "Tentative": "Tentativ",
    "Set": "Fastsatt",
    "Anchor date": "Ankerdato",
    "Set date": "Fastsatt dato",
    "Depends on anchor": "Avhenger av anker",
    "Depends on set anchor": "Avhenger av fastsatt anker",
    "{count} course days": "{count} kursdager",
    "Rendering mode": "Visningsmodus",
    "Year by year": "År for år",
    "Continuous": "Kontinuerlig",
    "Continuous mode: dates enter at the top and leave beneath the lower cut.": "Kontinuerlig modus: datoer kommer inn øverst og forsvinner under snittet nederst."
  }
};
  const resolveLocale = requested => {
    if (catalogues[requested]) return requested;
    const language = requested?.split('-')[0];
    return Object.keys(catalogues).find(locale => locale.startsWith(`${language}-`)) || 'en-GB';
  };
  const translate = (locale, id, values = {}) => (catalogues[locale]?.[id] || catalogues['en-GB']?.[id] || id).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '{' + name + '}');
  window.annualWheelI18n = { resolveLocale, translate };
})();
