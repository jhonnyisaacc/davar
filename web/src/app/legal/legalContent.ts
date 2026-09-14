// Web-only legal content to avoid cross-package module resolution issues.

export type LegalKind = "terms" | "privacy";

export type LegalDoc = {
	title: string;
	lastUpdated: string | null;
	body: string;
};

type LegalContent = Record<LegalKind, string>;

type LegalContentByLocale = {
	en: LegalContent;
	es: LegalContent;
	he: LegalContent;
};

const LEGAL_TITLES: Record<
	keyof LegalContentByLocale,
	Record<LegalKind, string>
> = {
	en: {
		terms: "Terms of Service of Davar",
		privacy: "Privacy Policy of Davar",
	},
	es: {
		terms: "Términos de Servicio de Davar",
		privacy: "Política de Privacidad de Davar",
	},
	he: {
		terms: "תנאי השירות של Davar",
		privacy: "מדיניות הפרטיות של Davar",
	},
};

const EN_TERMS = `# Terms of Service for Davar

**Effective Date:** February 8, 2026  
**Last Updated:** April 1, 2026

Welcome to Davar, an open-source project providing access to the Hebrew Bible (Tanakh) in its original language and hebrew translations of the Besorah, along with select translations and study resources. The Davar mobile application (the "App") is available on the Apple App Store and Google Play Store, and the associated website is located at https://davar.bible (collectively, the "Services").

These Terms of Service ("Terms") govern your access to and use of the Services. By downloading, installing, accessing, or using the App or Website, you agree to be bound by these Terms. If you do not agree, do not use the Services.

These Terms are provided in English. If you prefer another language, you may use your browser or device translation tools; the English version is authoritative.

## 1. Nature of the Services

Davar is a non-commercial, open-source project created to facilitate reading, studying, and meditating on the Hebrew Scriptures. The Services are provided "as is" without any warranty of accuracy, completeness, or fitness for any particular purpose beyond personal, non-commercial use.

Some datasets (including parts of Besorah Strong's mapping) are compiled from third-party sources and automated processing workflows. These datasets are provided for reference and study only, and may contain unresolved items, omissions, or mapping errors pending manual review.

## 2. User Eligibility

You must be at least 13 years old (or the minimum age required in your country to consent without parental approval). The Services are not directed to children under 13.

## 3. License to Use the Services

Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Services for your **personal, non-commercial purposes** only.

You may not:

- Use the Services for any commercial purpose without our written permission.
- Modify, distribute, sell, rent, lease, or sublicense any part of the Services or restricted content (e.g., copyrighted translations) beyond the limits in our third-party licensing agreements.
- Extract or share portions of copyrighted translations (e.g., TS2009, TTH) beyond permitted limits (e.g., API up to 100 verses, daily emails/RSS up to 250 verses, SMS up to 10 verses).
- Reverse engineer, decompile, or attempt to extract source code from the App (except as permitted under open-source licenses applicable to specific components).
- Use the Services in any way that violates applicable laws or infringes third-party rights.
- Introduce viruses, malware, or other harmful code.
- Use the Services to create competing products or services.

All use must include required copyright notices for third-party content (see Section 6). You agree not to infringe any licensor's rights.

## 4. User-Generated Content (Future Feature)

Currently, the App does not allow saving or submitting content. If features like personal notes, highlights, or annotations are added:

- Any content you create remains your personal property.
- If you enable optional cloud synchronization, you grant us a limited license to store, process, and transmit that content solely to provide synchronization and backup.
- You are solely responsible for your content; it must not be unlawful, harmful, or infringe third-party rights.
- We may remove or disable access to any user content that violates these Terms or law.
- User content must not violate third-party licenses (e.g., no commercial sharing of annotated restricted translations).
- We may implement moderation tools; content may not be recoverable upon service changes or termination.

## 5. Open-Source Nature

Davar is an open-source project. The source code is publicly available on GitHub[](https://github.com/jhonnyisaacc/davar). Use of the source code is governed by the specific open-source license in the repository (e.g., MIT, GPL, etc.). These Terms apply only to the official App and Website distributed by us.

While the Davar code is open-source, certain biblical texts and data (e.g., TS2009, TTH) are included under separate restricted licenses and may not be freely redistributed. Forks must respect these by excluding or obtaining separate permissions for restricted content.

## 6. Intellectual Property

The Hebrew Bible text, morphological data, lexicons, and other resources are sourced from public domain or permissively licensed materials. We claim no ownership over the biblical texts themselves.

For copyrighted translations (TS2009, TTH), we operate under specific agreements requiring notices and restricting uses. The App interface, design elements, and original code not covered by third-party licenses are © Davar Project (Jhonny / @jhonnyisaacc), all rights reserved, except as expressly licensed.

**Key Sources and Licenses:**

| Component                    | Source                                                                       | License/Status                                              | Attribution/Requirements                                                                                                            | Restrictions/Notes                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Hebrew Morphology (morphhb)  | https://github.com/openscriptures/morphhb                                    | CC BY 4.0 (lemma/morphology); WLC text public domain        | Credit "Open Scriptures Hebrew Bible Project" in redistribution/use                                                                 | Attribution required for CC BY parts; no commercial restrictions beyond that                                        |
| Hebrew Lexicon               | https://github.com/openscriptures/HebrewLexicon                              | CC BY 4.0; BDB/Strong's text public domain                  | Credit "Open Scriptures Hebrew Bible Project"                                                                                       | Attribution required; public domain core                                                                            |
| Hebrew Text                  | https://github.com/hebrew-bible/hebrew-bible.github.io                       | GPL-3.0                                                     | Standard GPL (include license in forks)                                                                                             | Derivatives must be GPL; no additional commercial ban                                                               |
| English Translation (TS2009) | Licensed from Institute for Scripture Research (agreement July 15, 2025)     | Custom non-exclusive, non-commercial                        | Display: "Scripture taken from The Scriptures, Copyright by Institute for Scripture Research. Used by permission." in every display | Non-commercial only; API <=100 verses, emails/RSS <=250, SMS <=10; no broad redistribution; error corrections required |
| Spanish Translation (TTH)    | Licensed from Natanael Doldan (agreement ~January 2026)                      | Custom non-exclusive, non-commercial                        | Display: "Texto tomado de la Traduccion Textual del Hebreo, Copyright por Natanael Doldan. Usado con permiso." in every display     | Non-commercial only; similar limits to TS2009; error corrections; donations to licensor voluntary                   |
| Spanish Translation (SPABES) | https://ebible.org/spabes/                                                   | CC BY 4.0                                                   | Credit "AudioBiblia.org / Irma Flores (info@audiobiblia.org)"; note changes if modified                                             | Redistribution ok with attribution; indicate if modified                                                            |
| Delitzsch Strong's           | https://www.ph4.org/b4_1.php?l=iw                                            | Unclear (site ©2005-2026 Ph4)                               | None specified; recommend crediting source                                                                                          | Initial mapping references were sourced from internet files; license unclear—use cautiously or consider alternatives |
| Qumran Differences/Data      | https://codeberg.org/dandeto/deadseainsights + document from Natanael Doldan | No license specified (treat as restricted)                  | Credit repository/author or Natanael Doldan if applicable                                                                           | Unclear permissions—contact for explicit license; treat as non-redistributable                                      |
| Fonts (SBL Hebrew)           | https://www.sbl-site.org/educational/BiblicalFonts_SBLHebrew.aspx            | SIL Open Font License 1.1                                   | Font credit not required but recommended                                                                                            | Free for personal and commercial use; modifications allowed                                                         |
| Fonts (Dead Sea Scrolls)     | Custom font files                                                            | Licensed                                                    | None required                                                                                                                       | Used under license agreement                                                                                        |
| Fonts (Proto-Sinaitic)       | Custom generated fonts                                                       | Public domain / Custom                                      | None required                                                                                                                       | Generated for project use                                                                                           |
| Fonts (Google Fonts)         | https://fonts.google.com                                                     | SIL Open Font License (Cardo, Arimo, Inter, Jost, Suez One) | Font credit not required per license                                                                                                | Free for personal and commercial use; web loads from Google CDN                                                     |

Future translations will follow similar non-commercial, attributed models. Users must comply with third-party licenses when using/sharing content. Biblical data is not necessarily redistributable under the code's open-source license.

## 7. Disclaimers and Limitation of Liability

THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

We are not responsible for:

- Errors, omissions, or inaccuracies in biblical text or data (including Qumran differences).
- Errors, omissions, or inaccuracies in Besorah Strong's mappings, including entries that are unreviewed, partially reviewed, or sourced from third-party reference files.
- Automated mapping outcomes that leave unresolved values (for example null, failed, or skipped) until future correction or review.
- Interruptions, delays, or data loss (including future notes).
- Any spiritual, emotional, or personal outcomes.

To the maximum extent permitted by law, our liability is limited to $0 (zero), as the Services are free.

## 8. Indemnification

You agree to indemnify and hold us harmless from claims, losses, or damages arising from your use of the Services in violation of these Terms or law.

## 9. Changes to the Services or Terms

We may modify, suspend, or discontinue any part of the Services without notice. We may update these Terms; continued use constitutes acceptance.

## 10. Privacy

Your use is also governed by our Privacy Policy (available at https://davar.bible/privacy or similar), which details minimal data collection (no accounts required currently; additional if cloud sync added).

## 11. Donations and Contributions

Davar accepts voluntary donations for development, maintenance, and expansion. Donations are non-refundable, with no expectation of goods, services, tax benefits, equity, or influence (Davar is not a registered nonprofit).

Methods (via Website):

- GitHub Sponsors (processed by GitHub; we receive after fees).

Donations used exclusively for project purposes. Periodic transparency reports posted (aggregate totals, categories). A portion may be voluntarily shared with licensors (e.g., TTH maintenance). Donors confirm legitimate sources; we may reject/return violating donations. No tax receipts issued.

## 12. Governing Law

These Terms are governed by the laws of the Republic of Argentina, without regard to conflict of laws principles. Disputes resolved in competent courts of the City of Buenos Aires, Argentina (subject to overriding terms in third-party licenses).

## 13. Third-Party Content

Davar incorporates third-party content under Section 6 licenses. We are not responsible for accuracy or availability. Changes (e.g., error corrections) may occur per licensor requests.

## 14. Entire Agreement

These Terms constitute the entire agreement regarding the Services and supersede prior understandings.

## Contact Us

For questions: hi@davar.bible

May the use of Davar bring you closer to understanding and walking in YHVH's eternal Word.
`;

const EN_PRIVACY = `# Privacy Policy for Davar

**Effective Date:** February 8, 2026  
**Last Updated:** April 1, 2026

Davar (the "App" and "Website") is an open-source project providing access to the Hebrew Bible (Tanakh) in its original language and hebrew translations of the Besorah. The App is available on the Apple App Store and Google Play Store, and the Website is hosted at https://davar.bible. This Privacy Policy explains our practices regarding any information when you use the App or visit the Website.

We are committed to your privacy, minimal data practices, and transparency as an open-source initiative. We do not collect personally identifiable information (PII) at this time. Our practices comply with Argentina's Personal Data Protection Law (Ley 25.326) and equivalent international standards (e.g., GDPR for EU users where applicable).

This Privacy Policy is provided in English. If you prefer another language, you may use your browser or device translation tools; the English version is authoritative.

## 1. Information We Collect – Current Practices

We do not collect any personally identifiable information (such as names, email addresses, phone numbers, precise location, device IDs linked to you, or other identifiers).

- **App Preferences and Local Data**: You can adjust display settings (font size, theme, text alignment, reading mode). These are stored locally on your device only and never transmitted to us or any third party.
- **Verse Notes and Annotations (Future Feature)**: Currently, the App does not support saving notes, highlights, or annotations on verses. If and when we implement this feature:
  - Notes will first be stored locally on your device (no transmission required for basic use).
  - In a future update, we may offer optional cloud synchronization to back up or access notes across devices. This would require your explicit consent and would involve transmitting minimal data (e.g., notes text, verse references, timestamps) to secure servers solely for sync and backup.
  - Any such cloud feature would be optional, encrypted in transit and at rest, and used exclusively for app functionality. We would not use notes for advertising, profiling, or sharing with third parties without additional consent.
- **Analytics or Tracking**: Currently, no analytics, cookies, tracking pixels, or third-party SDKs collect usage data. If we introduce anonymous analytics in the future (e.g., aggregated crash reports or usage stats like feature counts, without IPs or identifiers), we will update this Policy, declare it in app stores, and provide opt-out options.
- **Website Third-Party Services**:
  - **Google Fonts**: The Website loads fonts from Google Fonts CDN (fonts.googleapis.com). When you visit the Website, Google receives your IP address and User-Agent as part of the font delivery process. This is necessary for proper text display. We do not control Google's data practices; see [Google's Privacy Policy](https://policies.google.com/privacy).
  - **App Store Badge Images**: The Website displays download badges loaded from Apple and Google servers (developer.apple.com and play.google.com). Visiting pages with these images may transmit your IP address to Apple and Google.
  - **Website Hosting**: The Website is hosted by a third-party hosting provider that may process standard web server logs (IP addresses, request timestamps, URLs accessed) as part of content delivery. These logs are automatically generated and used solely for infrastructure operation and security.
- **API Rate Limiting**: Our API server temporarily processes IP addresses in memory for rate limiting and abuse prevention to ensure fair access for all users. These are not stored persistently.
- **Website Contact**: The Website lists a contact email for feedback or questions. If you email us, we receive your email address and message content voluntarily. We use this only to respond and delete it after support resolution (typically within 30 days).

## 2. How We Use Information

Any limited information (e.g., voluntary emails) is used solely to provide support. No personal data is used for marketing, advertising, or profiling. Future features like cloud-synced notes would be used exclusively to enable saving and retrieving your personal annotations on Scripture.

## 3. Information Sharing and Disclosure

We do not share, sell, or disclose any user information because we do not collect personal data automatically. As an open-source project on GitHub[](https://github.com/jhonnyisaacc/davar), any contributions or issues you submit follow GitHub's privacy practices.

If cloud features are added, notes would be processed by service providers (e.g., cloud storage like AWS or Google Cloud) under strict data processing agreements ensuring they act only on our instructions, with equivalent protection, and no further use.

No data is transferred internationally at this time. For future cloud features, transfers (if any) would ensure adequate safeguards under Ley 25.326.

## 4. Data Storage and Security

- **Local Data** (preferences, future local notes) stays on your device.
- Any future cloud storage would use industry-standard encryption (in transit via HTTPS and at rest where applicable) and security measures.
- We do not maintain servers holding personal user data currently.

## 5. Children's Privacy

The App and Website are not directed to children under 13. We do not knowingly collect data from children. If we learn of such collection, we will delete it promptly.

## 6. Your Rights

Under Ley 25.326 and similar laws, you have rights to access, rectify, update, or delete any personal data we hold (though currently none). For voluntary emails or future notes:

- Contact us to exercise rights (e.g., delete synced notes).
- We respond within 10 days (or as required by law).
- No fees for rights requests unless excessive.

## 7. Changes to This Privacy Policy

We may update this Policy to reflect new features (e.g., verse notes with optional cloud sync), legal requirements, or improvements. We will post the revised version at https://davar.bible/privacy with the new effective date. For significant changes involving new data collection, we will notify you in-app (e.g., pop-up or settings notice) and obtain consent where required by law before enabling the feature.

Continued use after changes means acceptance of the updated Policy.

## 8. Contact Us

For questions about this Policy or privacy, contact us at: hi@davar.bible

**Open-Source Note**: Davar is open source. The code is available on GitHub[](https://github.com/jhonnyisaacc/davar). This does not involve personal data collection through the repository.

May Davar be a tool to draw you closer to YHVH's Word in its pure form.
`;

const ES_TERMS = `# Términos de Servicio de Davar

**Fecha de entrada en vigor:** 8 de febrero de 2026  
**Última actualización:** 1 de abril de 2026

Bienvenido a Davar, un proyecto de código abierto que brinda acceso a la Biblia Hebrea (Tanaj) en su idioma original y a traducciones hebreas de la Besorah, junto con traducciones seleccionadas y recursos de estudio. La aplicación móvil de Davar (la "App") está disponible en Apple App Store y Google Play Store, y el sitio web asociado se encuentra en https://davar.bible (en conjunto, los "Servicios").

Estos Términos de Servicio ("Términos") regulan tu acceso y uso de los Servicios. Al descargar, instalar, acceder o usar la App o el Sitio Web, aceptas quedar sujeto a estos Términos. Si no estás de acuerdo, no uses los Servicios.

Estos Términos se proporcionan en inglés. Si prefieres otro idioma, puedes usar las herramientas de traducción de tu navegador o dispositivo; la versión en inglés es la autoritativa.

## 1. Naturaleza de los Servicios

Davar es un proyecto de código abierto, sin fines comerciales, creado para facilitar la lectura, el estudio y la meditación de las Escrituras Hebreas. Los Servicios se ofrecen "tal cual" sin garantías de exactitud, integridad o idoneidad para un propósito particular, más allá del uso personal y no comercial.

Algunos conjuntos de datos (incluyendo partes del mapeo Strong de la Besorah) se compilan a partir de fuentes de terceros y flujos de procesamiento automatizados. Estos conjuntos de datos se proveen solo para referencia y estudio, y pueden contener elementos sin resolver, omisiones o errores de mapeo pendientes de revisión manual.

## 2. Elegibilidad de Usuario

Debes tener al menos 13 años (o la edad mínima exigida en tu país para consentir sin aprobación parental). Los Servicios no están dirigidos a menores de 13 años.

## 3. Licencia para Usar los Servicios

Sujeto a estos Términos, te otorgamos una licencia limitada, no exclusiva, intransferible y revocable para acceder y usar los Servicios solo con fines personales y no comerciales.

No puedes:

- Usar los Servicios para fines comerciales sin nuestro permiso por escrito.
- Modificar, distribuir, vender, alquilar, arrendar o sublicenciar cualquier parte de los Servicios o contenido restringido (por ejemplo, traducciones con copyright) más allá de los límites de nuestros acuerdos de licencias de terceros.
- Extraer o compartir porciones de traducciones con copyright (por ejemplo, TS2009, TTH) más allá de los límites permitidos (por ejemplo, API hasta 100 versículos, correos/RSS diarios hasta 250 versículos, SMS hasta 10 versículos).
- Hacer ingeniería inversa, descompilar o intentar extraer código fuente de la App (salvo lo permitido por licencias de código abierto aplicables a componentes específicos).
- Usar los Servicios de cualquier manera que viole leyes aplicables o infrinja derechos de terceros.
- Introducir virus, malware u otro código dañino.
- Usar los Servicios para crear productos o servicios competidores.

Todo uso debe incluir los avisos de copyright requeridos para contenido de terceros (ver Sección 6). Aceptas no infringir derechos de ningún licenciante.

## 4. Contenido Generado por el Usuario (Función Futura)

Actualmente, la App no permite guardar ni enviar contenido. Si se agregan funciones como notas personales, resaltados o anotaciones:

- Cualquier contenido que crees seguirá siendo tu propiedad personal.
- Si habilitas la sincronización opcional en la nube, nos otorgas una licencia limitada para almacenar, procesar y transmitir ese contenido únicamente para proporcionar sincronización y respaldo.
- Eres el único responsable de tu contenido; no debe ser ilegal, dañino ni infringir derechos de terceros.
- Podemos eliminar o deshabilitar el acceso a contenido de usuario que viole estos Términos o la ley.
- El contenido de usuario no debe violar licencias de terceros (por ejemplo, no compartir comercialmente traducciones restringidas anotadas).
- Podemos implementar herramientas de moderación; es posible que el contenido no sea recuperable ante cambios o terminación del servicio.

## 5. Naturaleza de Código Abierto

Davar es un proyecto de código abierto. El código fuente está disponible públicamente en GitHub[](https://github.com/jhonnyisaacc/davar). El uso del código fuente se rige por la licencia de código abierto específica del repositorio (por ejemplo, MIT, GPL, etc.). Estos Términos aplican solo a la App y al Sitio Web oficiales distribuidos por nosotros.

Aunque el código de Davar es de código abierto, ciertos textos y datos bíblicos (por ejemplo, TS2009, TTH) se incluyen bajo licencias restringidas separadas y pueden no redistribuirse libremente. Los forks deben respetarlo excluyendo contenido restringido u obteniendo permisos separados.

## 6. Propiedad Intelectual

El texto de la Biblia Hebrea, los datos morfológicos, léxicos y otros recursos provienen de materiales de dominio público o con licencias permisivas. No reclamamos propiedad sobre los textos bíblicos.

Para traducciones con copyright (TS2009, TTH), operamos bajo acuerdos específicos que requieren avisos y restringen usos. La interfaz de la App, elementos de diseño y código original no cubiertos por licencias de terceros son © Proyecto Davar (Jhonny / @jhonnyisaacc), todos los derechos reservados, salvo licencia expresa.

**Fuentes y Licencias Clave:**

| Component                    | Source                                                                       | License/Status                                              | Attribution/Requirements                                                                                                            | Restrictions/Notes                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Hebrew Morphology (morphhb)  | https://github.com/openscriptures/morphhb                                    | CC BY 4.0 (lemma/morphology); WLC text public domain        | Credit "Open Scriptures Hebrew Bible Project" in redistribution/use                                                                 | Attribution required for CC BY parts; no commercial restrictions beyond that                                        |
| Hebrew Lexicon               | https://github.com/openscriptures/HebrewLexicon                              | CC BY 4.0; BDB/Strong's text public domain                  | Credit "Open Scriptures Hebrew Bible Project"                                                                                       | Attribution required; public domain core                                                                            |
| Hebrew Text                  | https://github.com/hebrew-bible/hebrew-bible.github.io                       | GPL-3.0                                                     | Standard GPL (include license in forks)                                                                                             | Derivatives must be GPL; no additional commercial ban                                                               |
| English Translation (TS2009) | Licensed from Institute for Scripture Research (agreement July 15, 2025)     | Custom non-exclusive, non-commercial                        | Display: "Scripture taken from The Scriptures, Copyright by Institute for Scripture Research. Used by permission." in every display | Non-commercial only; API <=100 verses, emails/RSS <=250, SMS <=10; no broad redistribution; error corrections required |
| Spanish Translation (TTH)    | Licensed from Natanael Doldan (agreement ~January 2026)                      | Custom non-exclusive, non-commercial                        | Display: "Texto tomado de la Traduccion Textual del Hebreo, Copyright por Natanael Doldan. Usado con permiso." in every display     | Non-commercial only; similar limits to TS2009; error corrections; donations to licensor voluntary                   |
| Spanish Translation (SPABES) | https://ebible.org/spabes/                                                   | CC BY 4.0                                                   | Credit "AudioBiblia.org / Irma Flores (info@audiobiblia.org)"; note changes if modified                                             | Redistribution ok with attribution; indicate if modified                                                            |
| Delitzsch Strong's           | https://www.ph4.org/b4_1.php?l=iw                                            | Unclear (site ©2005-2026 Ph4)                               | None specified; recommend crediting source                                                                                          | Initial mapping references were sourced from internet files; license unclear-use cautiously or consider alternatives |
| Qumran Differences/Data      | https://codeberg.org/dandeto/deadseainsights + document from Natanael Doldan | No license specified (treat as restricted)                  | Credit repository/author or Natanael Doldan if applicable                                                                           | Unclear permissions-contact for explicit license; treat as non-redistributable                                      |
| Fonts (SBL Hebrew)           | https://www.sbl-site.org/educational/BiblicalFonts_SBLHebrew.aspx            | SIL Open Font License 1.1                                   | Font credit not required but recommended                                                                                            | Free for personal and commercial use; modifications allowed                                                         |
| Fonts (Dead Sea Scrolls)     | Custom font files                                                            | Licensed                                                    | None required                                                                                                                       | Used under license agreement                                                                                        |
| Fonts (Proto-Sinaitic)       | Custom generated fonts                                                       | Public domain / Custom                                      | None required                                                                                                                       | Generated for project use                                                                                           |
| Fonts (Google Fonts)         | https://fonts.google.com                                                     | SIL Open Font License (Cardo, Arimo, Inter, Jost, Suez One) | Font credit not required per license                                                                                                | Free for personal and commercial use; web loads from Google CDN                                                     |

Las futuras traducciones seguirán modelos similares no comerciales y con atribución. Los usuarios deben cumplir con licencias de terceros al usar o compartir contenido. Los datos bíblicos no necesariamente son redistribuibles bajo la licencia de código abierto del código.

## 7. Exenciones y Limitación de Responsabilidad

LOS SERVICIOS SE PROPORCIONAN "TAL CUAL" Y "SEGÚN DISPONIBILIDAD", SIN GARANTÍAS DE NINGÚN TIPO, EXPRESAS O IMPLÍCITAS, INCLUIDAS COMERCIABILIDAD, IDONEIDAD PARA UN PROPÓSITO PARTICULAR O NO INFRACCIÓN.

No somos responsables de:

- Errores, omisiones o inexactitudes en texto o datos bíblicos (incluyendo diferencias de Qumrán).
- Errores, omisiones o inexactitudes en mapeos Strong de la Besorah, incluyendo entradas no revisadas, parcialmente revisadas o provenientes de archivos de referencia de terceros.
- Resultados de mapeo automatizado que dejen valores sin resolver (por ejemplo null, failed o skipped) hasta futura corrección o revisión.
- Interrupciones, retrasos o pérdida de datos (incluyendo notas futuras).
- Cualquier resultado espiritual, emocional o personal.

En la máxima medida permitida por ley, nuestra responsabilidad se limita a $0 (cero), ya que los Servicios son gratuitos.

## 8. Indemnización

Aceptas indemnizarnos y mantenernos indemnes frente a reclamaciones, pérdidas o daños derivados de tu uso de los Servicios en violación de estos Términos o de la ley.

## 9. Cambios en los Servicios o Términos

Podemos modificar, suspender o discontinuar cualquier parte de los Servicios sin aviso. Podemos actualizar estos Términos; el uso continuado constituye aceptación.

## 10. Privacidad

Tu uso también se rige por nuestra Política de Privacidad (disponible en https://davar.bible/privacy o similar), que detalla una recopilación mínima de datos (actualmente sin cuentas obligatorias; adicional si se agrega sincronización en la nube).

## 11. Donaciones y Contribuciones

Davar acepta donaciones voluntarias para desarrollo, mantenimiento y expansión. Las donaciones no son reembolsables y no implican expectativa de bienes, servicios, beneficios fiscales, participación o influencia (Davar no es una entidad sin fines de lucro registrada).

Métodos (vía Sitio Web):

- GitHub Sponsors (procesado por GitHub; recibimos fondos después de comisiones).

Las donaciones se usan exclusivamente para fines del proyecto. Se publicarán informes periódicos de transparencia (totales agregados y categorías). Una parte puede compartirse voluntariamente con licenciantes (por ejemplo, mantenimiento de TTH). Los donantes confirman fuentes legítimas; podemos rechazar o devolver donaciones que violen normas. No se emiten comprobantes fiscales.

## 12. Ley Aplicable

Estos Términos se rigen por las leyes de la República Argentina, sin considerar principios de conflicto de leyes. Las disputas se resolverán en tribunales competentes de la Ciudad de Buenos Aires, Argentina (sujeto a términos imperativos en licencias de terceros).

## 13. Contenido de Terceros

Davar incorpora contenido de terceros bajo las licencias de la Sección 6. No somos responsables de su exactitud o disponibilidad. Pueden ocurrir cambios (por ejemplo, correcciones de errores) por solicitud de licenciantes.

## 14. Acuerdo Completo

Estos Términos constituyen el acuerdo completo respecto de los Servicios y reemplazan entendimientos previos.

## Contáctanos

Para consultas: hi@davar.bible

Que el uso de Davar te acerque a comprender y caminar en la Palabra eterna de YHVH.
`;

const ES_PRIVACY = `# Política de Privacidad de Davar

**Fecha de entrada en vigor:** 8 de febrero de 2026  
**Última actualización:** 1 de abril de 2026

Davar (la "App" y el "Sitio Web") es un proyecto de código abierto que brinda acceso a la Biblia Hebrea (Tanaj) en su idioma original y a traducciones hebreas de la Besorah. La App está disponible en Apple App Store y Google Play Store, y el Sitio Web está alojado en https://davar.bible. Esta Política de Privacidad explica nuestras prácticas sobre cualquier información cuando usas la App o visitas el Sitio Web.

Estamos comprometidos con tu privacidad, con prácticas de datos mínimas y con la transparencia como iniciativa de código abierto. Actualmente no recopilamos información personal identificable (PII). Nuestras prácticas cumplen con la Ley 25.326 de Protección de Datos Personales de Argentina y estándares internacionales equivalentes (por ejemplo, GDPR para usuarios de la UE cuando corresponda).

Esta Política de Privacidad se proporciona en inglés. Si prefieres otro idioma, puedes usar las herramientas de traducción de tu navegador o dispositivo; la versión en inglés es la autoritativa.

## 1. Información que Recopilamos - Prácticas Actuales

No recopilamos información personal identificable (como nombres, correos electrónicos, números de teléfono, ubicación precisa, IDs de dispositivo vinculados contigo u otros identificadores).

- **Preferencias de la App y Datos Locales**: Puedes ajustar configuraciones de visualización (tamaño de fuente, tema, alineación de texto, modo de lectura). Se almacenan solo localmente en tu dispositivo y nunca se transmiten a nosotros ni a terceros.
- **Notas y Anotaciones de Versículos (Función Futura)**: Actualmente, la App no permite guardar notas, resaltados o anotaciones. Si implementamos esta función:
  - Las notas se almacenarán primero en tu dispositivo (sin transmisión para uso básico).
  - En una futura actualización, podríamos ofrecer sincronización opcional en la nube para respaldo o acceso entre dispositivos. Esto requeriría tu consentimiento explícito e implicaría transmitir datos mínimos (por ejemplo, texto de notas, referencias de versículos, marcas de tiempo) a servidores seguros únicamente para sincronización y respaldo.
  - Cualquier función en la nube sería opcional, cifrada en tránsito y en reposo, y usada exclusivamente para funcionalidad de la app. No usaríamos notas para publicidad, perfilado ni para compartir con terceros sin consentimiento adicional.
- **Analítica o Seguimiento**: Actualmente, ninguna analítica, cookie, píxel de seguimiento o SDK de terceros recopila datos de uso. Si introducimos analítica anónima en el futuro (por ejemplo, reportes agregados de fallos o estadísticas de uso sin IP ni identificadores), actualizaremos esta Política, lo declararemos en las tiendas y ofreceremos opciones de exclusión.
- **Servicios de Terceros en el Sitio Web**:
  - **Google Fonts**: El Sitio Web carga fuentes desde el CDN de Google Fonts (fonts.googleapis.com). Cuando visitas el Sitio Web, Google recibe tu dirección IP y User-Agent como parte del proceso de entrega de fuentes. Esto es necesario para mostrar el texto correctamente. No controlamos las prácticas de datos de Google; consulta [Política de Privacidad de Google](https://policies.google.com/privacy).
  - **Imágenes de Insignias de Tiendas**: El Sitio Web muestra insignias de descarga cargadas desde servidores de Apple y Google (developer.apple.com y play.google.com). Visitar páginas con estas imágenes puede transmitir tu IP a Apple y Google.
  - **Alojamiento del Sitio Web**: El Sitio Web está alojado por un proveedor externo que puede procesar registros estándar del servidor web (direcciones IP, marcas de tiempo de solicitudes, URLs accedidas) como parte de la entrega de contenido. Estos registros se generan automáticamente y se usan solo para operación de infraestructura y seguridad.
- **Limitación de Tasa de API**: Nuestro servidor API procesa temporalmente direcciones IP en memoria para limitación de tasa y prevención de abuso, para garantizar acceso justo a todos los usuarios. No se almacenan de forma persistente.
- **Contacto del Sitio Web**: El Sitio Web publica un correo de contacto para consultas o comentarios. Si nos escribes, recibimos tu dirección de correo y el contenido del mensaje de forma voluntaria. Lo usamos solo para responder y lo eliminamos tras resolver soporte (normalmente dentro de 30 días).

## 2. Cómo Usamos la Información

Cualquier información limitada (por ejemplo, correos voluntarios) se usa únicamente para brindar soporte. Ningún dato personal se usa para marketing, publicidad o perfilado. Funciones futuras como notas sincronizadas en la nube se usarían exclusivamente para habilitar guardado y recuperación de tus anotaciones personales sobre la Escritura.

## 3. Compartición y Divulgación de Información

No compartimos, vendemos ni divulgamos información de usuarios porque no recopilamos datos personales automáticamente. Como proyecto de código abierto en GitHub[](https://github.com/jhonnyisaacc/davar), cualquier contribución o issue que envíes sigue las prácticas de privacidad de GitHub.

Si se agregan funciones en la nube, las notas podrían ser procesadas por proveedores de servicios (por ejemplo, almacenamiento en la nube como AWS o Google Cloud) bajo acuerdos estrictos de tratamiento de datos, asegurando que actúen solo bajo nuestras instrucciones, con protección equivalente y sin uso adicional.

Actualmente no hay transferencia internacional de datos. Para futuras funciones en la nube, cualquier transferencia se realizará con salvaguardas adecuadas bajo la Ley 25.326.

## 4. Almacenamiento y Seguridad de Datos

- **Datos Locales** (preferencias, futuras notas locales) permanecen en tu dispositivo.
- Cualquier futuro almacenamiento en la nube usaría cifrado estándar de la industria (en tránsito vía HTTPS y en reposo cuando aplique) y medidas de seguridad.
- Actualmente no mantenemos servidores con datos personales de usuarios.

## 5. Privacidad de Menores

La App y el Sitio Web no están dirigidos a menores de 13 años. No recopilamos conscientemente datos de menores. Si descubrimos tal recopilación, la eliminaremos de inmediato.

## 6. Tus Derechos

Bajo la Ley 25.326 y leyes similares, tienes derecho a acceder, rectificar, actualizar o eliminar cualquier dato personal que tengamos (aunque actualmente no tenemos ninguno). Para correos voluntarios o futuras notas:

- Contáctanos para ejercer derechos (por ejemplo, eliminar notas sincronizadas).
- Respondemos dentro de 10 días (o según lo exija la ley).
- Sin cargos por solicitudes de derechos, salvo casos excesivos.

## 7. Cambios a esta Política de Privacidad

Podemos actualizar esta Política para reflejar nuevas funciones (por ejemplo, notas con sincronización opcional), requisitos legales o mejoras. Publicaremos la versión revisada en https://davar.bible/privacy con la nueva fecha de entrada en vigor. Para cambios significativos que impliquen nueva recopilación de datos, te notificaremos dentro de la app (por ejemplo, ventana emergente o aviso en ajustes) y obtendremos consentimiento cuando lo exija la ley antes de habilitar la función.

El uso continuado después de cambios significa aceptación de la Política actualizada.

## 8. Contáctanos

Para consultas sobre esta Política o privacidad, contáctanos en: hi@davar.bible

**Nota de Código Abierto**: Davar es de código abierto. El código está disponible en GitHub[](https://github.com/jhonnyisaacc/davar). Esto no implica recopilación de datos personales a través del repositorio.

Que Davar sea una herramienta para acercarte a la Palabra de YHVH en su forma pura.
`;

const HE_TERMS = `# תנאי השירות של Davar

**תאריך כניסה לתוקף:** 8 בפברואר 2026  
**עדכון אחרון:** 1 באפריל 2026

ברוכים הבאים ל-Davar, פרויקט קוד פתוח המספק גישה לתנ"ך העברי (תנ"ך) בשפת המקור ולתרגומים עבריים של הבשורה, יחד עם תרגומים נבחרים ומשאבי לימוד. אפליקציית Davar לנייד ("האפליקציה") זמינה ב-Apple App Store וב-Google Play Store, והאתר המשויך נמצא ב-https://davar.bible (יחד: "השירותים").

תנאי שירות אלה ("התנאים") מסדירים את הגישה והשימוש שלך בשירותים. בהורדה, התקנה, גישה או שימוש באפליקציה או באתר, אתה מסכים להיות כפוף לתנאים אלה. אם אינך מסכים, אל תשתמש בשירותים.

תנאים אלה מסופקים באנגלית. אם אתה מעדיף שפה אחרת, ניתן להשתמש בכלי תרגום של הדפדפן או המכשיר; הגרסה האנגלית היא הקובעת.

## 1. אופי השירותים

Davar הוא פרויקט קוד פתוח ללא מטרות רווח מסחרי, שנוצר כדי לאפשר קריאה, לימוד והעמקה בכתבי הקודש העבריים. השירותים ניתנים כפי שהם וללא אחריות לדיוק, שלמות או התאמה למטרה מסוימת מעבר לשימוש אישי ולא מסחרי.

חלק ממאגרי הנתונים (כולל חלקים ממיפוי Strong של הבשורה) מורכבים ממקורות צד שלישי ומתהליכי עיבוד אוטומטיים. מאגרים אלה ניתנים לעיון וללימוד בלבד, ועלולים לכלול פריטים לא פתורים, השמטות או שגיאות מיפוי עד לביקורת ידנית.

## 2. כשירות משתמש

עליך להיות בן 13 לפחות (או גיל ההסכמה המינימלי במדינתך ללא אישור הורי). השירותים אינם מיועדים לילדים מתחת לגיל 13.

## 3. רישיון שימוש בשירותים

בכפוף לתנאים אלה, אנו מעניקים לך רישיון מוגבל, לא בלעדי, בלתי ניתן להעברה וניתן לביטול, לגשת ולהשתמש בשירותים למטרות אישיות ולא מסחריות בלבד.

אסור לך:

- להשתמש בשירותים לכל מטרה מסחרית ללא אישור בכתב מאתנו.
- לשנות, להפיץ, למכור, להשכיר, להחכיר או להעניק רישיון משנה לכל חלק מהשירותים או לתוכן מוגבל (למשל תרגומים מוגני זכויות יוצרים) מעבר למגבלות הסכמי הרישוי עם צדדים שלישיים.
- לחלץ או לשתף חלקים מתרגומים מוגני זכויות יוצרים (למשל TS2009, TTH) מעבר למגבלות המותרות (למשל API עד 100 פסוקים, דוא"ל/RSS יומי עד 250 פסוקים, SMS עד 10 פסוקים).
- לבצע הנדסה לאחור, דה-קומפילציה או ניסיון לחלץ קוד מקור מהאפליקציה (למעט כפי שמותר ברישיונות קוד פתוח החלים על רכיבים מסוימים).
- להשתמש בשירותים באופן המפר דין חל או זכויות צד שלישי.
- להחדיר וירוסים, נוזקות או קוד מזיק אחר.
- להשתמש בשירותים כדי ליצור מוצרים או שירותים מתחרים.

כל שימוש חייב לכלול הודעות זכויות יוצרים נדרשות לתוכן צד שלישי (ראו סעיף 6). אתה מסכים לא להפר זכויות של מעניקי רישיון.

## 4. תוכן שנוצר על ידי משתמשים (פיצ'ר עתידי)

כיום האפליקציה אינה מאפשרת שמירה או שליחה של תוכן. אם יתווספו תכונות כגון הערות אישיות, סימונים או אנוטציות:

- כל תוכן שתיצור יישאר בבעלותך.
- אם תפעיל סנכרון ענן אופציונלי, תעניק לנו רישיון מוגבל לאחסן, לעבד ולהעביר את התוכן רק לצורך סנכרון וגיבוי.
- אתה האחראי הבלעדי לתוכן שלך; הוא לא יהיה בלתי חוקי, מזיק או מפר זכויות צד שלישי.
- אנו רשאים להסיר או לחסום גישה לתוכן משתמש המפר תנאים אלה או את החוק.
- תוכן משתמש לא יפר רישיונות צד שלישי (למשל אין שיתוף מסחרי של תרגומים מוגבלים עם הערות).
- ייתכן שניישם כלי מיתון; ייתכן שהתוכן לא יהיה בר-שחזור במקרה של שינויי שירות או סיום.

## 5. אופי קוד פתוח

Davar הוא פרויקט קוד פתוח. קוד המקור זמין לציבור ב-GitHub[](https://github.com/jhonnyisaacc/davar). השימוש בקוד המקור כפוף לרישיון הקוד הפתוח הספציפי במאגר (למשל MIT, GPL ועוד). תנאים אלה חלים רק על האפליקציה והאתר הרשמיים המופצים על ידינו.

למרות שקוד Davar הוא קוד פתוח, טקסטים ונתונים מקראיים מסוימים (למשל TS2009, TTH) כלולים תחת רישיונות מוגבלים נפרדים ואינם תמיד ניתנים להפצה חופשית. מזלגות חייבים לכבד זאת באמצעות החרגת תוכן מוגבל או קבלת אישורים נפרדים.

## 6. קניין רוחני

טקסט התנ"ך העברי, נתוני מורפולוגיה, לקסיקונים ומשאבים נוספים מבוססים על חומרים בנחלת הכלל או ברישוי מתירני. איננו טוענים לבעלות על הטקסטים המקראיים עצמם.

לגבי תרגומים מוגני זכויות יוצרים (TS2009, TTH), אנו פועלים תחת הסכמים ייעודיים המחייבים ייחוס ומגבילים שימושים. ממשק האפליקציה, רכיבי העיצוב והקוד המקורי שאינם מכוסים ברישיונות צד שלישי הם © Davar Project (Jhonny / @jhonnyisaacc), כל הזכויות שמורות, אלא אם צוין אחרת ברישיון.

**מקורות ורישיונות עיקריים:**

| Component                    | Source                                                                       | License/Status                                              | Attribution/Requirements                                                                                                            | Restrictions/Notes                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Hebrew Morphology (morphhb)  | https://github.com/openscriptures/morphhb                                    | CC BY 4.0 (lemma/morphology); WLC text public domain        | Credit "Open Scriptures Hebrew Bible Project" in redistribution/use                                                                 | Attribution required for CC BY parts; no commercial restrictions beyond that                                        |
| Hebrew Lexicon               | https://github.com/openscriptures/HebrewLexicon                              | CC BY 4.0; BDB/Strong's text public domain                  | Credit "Open Scriptures Hebrew Bible Project"                                                                                       | Attribution required; public domain core                                                                            |
| Hebrew Text                  | https://github.com/hebrew-bible/hebrew-bible.github.io                       | GPL-3.0                                                     | Standard GPL (include license in forks)                                                                                             | Derivatives must be GPL; no additional commercial ban                                                               |
| English Translation (TS2009) | Licensed from Institute for Scripture Research (agreement July 15, 2025)     | Custom non-exclusive, non-commercial                        | Display: "Scripture taken from The Scriptures, Copyright by Institute for Scripture Research. Used by permission." in every display | Non-commercial only; API <=100 verses, emails/RSS <=250, SMS <=10; no broad redistribution; error corrections required |
| Spanish Translation (TTH)    | Licensed from Natanael Doldan (agreement ~January 2026)                      | Custom non-exclusive, non-commercial                        | Display: "Texto tomado de la Traduccion Textual del Hebreo, Copyright por Natanael Doldan. Usado con permiso." in every display     | Non-commercial only; similar limits to TS2009; error corrections; donations to licensor voluntary                   |
| Spanish Translation (SPABES) | https://ebible.org/spabes/                                                   | CC BY 4.0                                                   | Credit "AudioBiblia.org / Irma Flores (info@audiobiblia.org)"; note changes if modified                                             | Redistribution ok with attribution; indicate if modified                                                            |
| Delitzsch Strong's           | https://www.ph4.org/b4_1.php?l=iw                                            | Unclear (site ©2005-2026 Ph4)                               | None specified; recommend crediting source                                                                                          | Initial mapping references were sourced from internet files; license unclear-use cautiously or consider alternatives |
| Qumran Differences/Data      | https://codeberg.org/dandeto/deadseainsights + document from Natanael Doldan | No license specified (treat as restricted)                  | Credit repository/author or Natanael Doldan if applicable                                                                           | Unclear permissions-contact for explicit license; treat as non-redistributable                                      |
| Fonts (SBL Hebrew)           | https://www.sbl-site.org/educational/BiblicalFonts_SBLHebrew.aspx            | SIL Open Font License 1.1                                   | Font credit not required but recommended                                                                                            | Free for personal and commercial use; modifications allowed                                                         |
| Fonts (Dead Sea Scrolls)     | Custom font files                                                            | Licensed                                                    | None required                                                                                                                       | Used under license agreement                                                                                        |
| Fonts (Proto-Sinaitic)       | Custom generated fonts                                                       | Public domain / Custom                                      | None required                                                                                                                       | Generated for project use                                                                                           |
| Fonts (Google Fonts)         | https://fonts.google.com                                                     | SIL Open Font License (Cardo, Arimo, Inter, Jost, Suez One) | Font credit not required per license                                                                                                | Free for personal and commercial use; web loads from Google CDN                                                     |

תרגומים עתידיים ימשיכו במודל דומה: שימוש לא מסחרי וייחוס נדרש. על המשתמשים לעמוד ברישיונות צד שלישי בעת שימוש או שיתוף תוכן. נתונים מקראיים אינם בהכרח ניתנים להפצה מחדש תחת רישיון הקוד של הפרויקט.

## 7. הסתייגויות והגבלת אחריות

השירותים ניתנים כפי שהם וכפי שזמינים, ללא אחריות מכל סוג, מפורשת או משתמעת, לרבות סחירות, התאמה למטרה מסוימת או אי-הפרה.

איננו אחראים ל:

- שגיאות, השמטות או אי-דיוקים בטקסט או בנתונים מקראיים (כולל הבדלי קומראן).
- שגיאות, השמטות או אי-דיוקים במיפויי Strong של הבשורה, כולל ערכים שלא נבדקו, נבדקו חלקית או נסמכו על קבצי ייחוס של צד שלישי.
- תוצאות מיפוי אוטומטי שמשאירות ערכים לא פתורים (למשל null, failed או skipped) עד לתיקון או בדיקה עתידיים.
- הפסקות, עיכובים או אובדן נתונים (כולל הערות עתידיות).
- כל תוצאה רוחנית, רגשית או אישית.

במידה המרבית המותרת בדין, אחריותנו מוגבלת ל-$0 (אפס), מאחר שהשירותים ניתנים בחינם.

## 8. שיפוי

אתה מסכים לשפות ולהגן עלינו מפני תביעות, הפסדים או נזקים הנובעים מהשימוש שלך בשירותים בניגוד לתנאים אלה או לדין.

## 9. שינויים בשירותים או בתנאים

אנו רשאים לשנות, להשעות או להפסיק כל חלק מהשירותים ללא הודעה מוקדמת. אנו רשאים לעדכן תנאים אלה; המשך שימוש מהווה הסכמה.

## 10. פרטיות

השימוש שלך כפוף גם למדיניות הפרטיות שלנו (זמינה ב-https://davar.bible/privacy או דומה), המפרטת איסוף נתונים מינימלי (ללא חשבונות נדרשים כיום; ייתכן נתונים נוספים אם יתווסף סנכרון ענן).

## 11. תרומות ומענקים

Davar מקבל תרומות וולונטריות לפיתוח, תחזוקה והרחבה. תרומות אינן ניתנות להחזר, ואין ציפייה לתמורה, שירותים, הטבות מס, בעלות או השפעה (Davar אינו גוף ללא מטרות רווח רשום).

דרכים (דרך האתר):

- GitHub Sponsors (מעובד על ידי GitHub; אנו מקבלים לאחר עמלות).

התרומות משמשות אך ורק למטרות הפרויקט. יפורסמו דוחות שקיפות תקופתיים (סכומים מצטברים וקטגוריות). ייתכן שחלק יועבר מרצון לבעלי רישיון (למשל תחזוקת TTH). תורמים מאשרים מקור כספים לגיטימי; אנו רשאים לדחות או להשיב תרומות מפרות. לא מונפקות קבלות מס.

## 12. דין חל

תנאים אלה כפופים לדיני הרפובליקה הארגנטינאית, ללא תחולה לעקרונות ברירת דין. מחלוקות יתבררו בבתי המשפט המוסמכים בעיר בואנוס איירס, ארגנטינה (בכפוף לתנאים מחייבים ברישיונות צד שלישי).

## 13. תוכן צד שלישי

Davar משלב תוכן של צדדים שלישיים תחת רישיונות סעיף 6. איננו אחראים לדיוק או לזמינות. ייתכנו שינויים (למשל תיקוני שגיאות) לפי דרישת מעניקי רישיון.

## 14. הסכם מלא

תנאים אלה מהווים את ההסכם המלא בנוגע לשירותים ומחליפים כל הבנות קודמות.

## יצירת קשר

לשאלות: hi@davar.bible

מי ייתן והשימוש ב-Davar יקרב אותך להבנה ולהליכה בדברו הנצחי של YHVH.
`;

const HE_PRIVACY = `# מדיניות הפרטיות של Davar

**תאריך כניסה לתוקף:** 8 בפברואר 2026  
**עדכון אחרון:** 1 באפריל 2026

Davar ("האפליקציה" ו"האתר") הוא פרויקט קוד פתוח המספק גישה לתנ"ך העברי בשפת המקור ולתרגומים עבריים של הבשורה. האפליקציה זמינה ב-Apple App Store וב-Google Play Store, והאתר מתארח ב-https://davar.bible. מדיניות פרטיות זו מסבירה את נוהלי הטיפול שלנו במידע כאשר אתה משתמש באפליקציה או מבקר באתר.

אנו מחויבים לפרטיותך, למזעור איסוף נתונים ולשקיפות כיוזמת קוד פתוח. בשלב זה איננו אוספים מידע אישי מזהה (PII). הנהלים שלנו עומדים בחוק הגנת הנתונים האישי של ארגנטינה (Ley 25.326) ובסטנדרטים בינלאומיים מקבילים (למשל GDPR למשתמשי האיחוד האירופי כאשר רלוונטי).

מדיניות פרטיות זו מסופקת באנגלית. אם אתה מעדיף שפה אחרת, ניתן להשתמש בכלי תרגום של הדפדפן או המכשיר; הגרסה האנגלית היא הקובעת.

## 1. מידע שאנו אוספים - הנהלים הנוכחיים

איננו אוספים מידע אישי מזהה (כגון שמות, כתובות דוא"ל, מספרי טלפון, מיקום מדויק, מזהי מכשיר המקושרים אליך או מזהים אחרים).

- **העדפות אפליקציה ונתונים מקומיים**: ניתן להתאים הגדרות תצוגה (גודל גופן, ערכת נושא, יישור טקסט, מצב קריאה). נתונים אלה נשמרים מקומית במכשיר בלבד ואינם מועברים אלינו או לצד שלישי.
- **הערות ואנוטציות לפסוקים (פיצ'ר עתידי)**: כיום האפליקציה אינה תומכת בשמירת הערות, סימונים או אנוטציות. אם וכאשר נוסיף תכונה זו:
  - ההערות יישמרו תחילה מקומית במכשיר (ללא העברה לצורך שימוש בסיסי).
  - בעדכון עתידי נוכל להציע סנכרון ענן אופציונלי לגיבוי או גישה בין מכשירים. הדבר ידרוש הסכמה מפורשת שלך ויכלול העברה של נתונים מינימליים (למשל טקסט הערות, הפניות פסוקים וחותמות זמן) לשרתים מאובטחים לצורכי סנכרון וגיבוי בלבד.
  - כל תכונת ענן תהיה אופציונלית, מוצפנת בתעבורה ובמנוחה, ותשמש לפונקציונליות האפליקציה בלבד. לא נשתמש בהערות לפרסום, פרופיילינג או שיתוף עם צדדים שלישיים ללא הסכמה נוספת.
- **אנליטיקה או מעקב**: נכון לעכשיו אין אנליטיקה, עוגיות, פיקסלים למעקב או SDK של צד שלישי שאוספים נתוני שימוש. אם נכניס בעתיד אנליטיקה אנונימית (למשל דוחות קריסה מצטברים או סטטיסטיקות שימוש ללא IP או מזהים), נעדכן מדיניות זו, נצהיר על כך בחנויות האפליקציות ונספק אפשרויות ביטול.
- **שירותי צד שלישי באתר**:
  - **Google Fonts**: האתר טוען גופנים מ-CDN של Google Fonts (fonts.googleapis.com). בעת ביקור באתר, Google מקבלת את כתובת ה-IP ואת User-Agent שלך כחלק מתהליך טעינת הגופנים. זה נדרש להצגה תקינה של טקסט. איננו שולטים בנוהלי הנתונים של Google; ראה [מדיניות הפרטיות של Google](https://policies.google.com/privacy).
  - **תמונות תגי חנויות**: האתר מציג תגי הורדה הטעונים משרתי Apple ו-Google (developer.apple.com ו-play.google.com). ביקור בדפים עם תמונות אלה עשוי להעביר את כתובת ה-IP שלך ל-Apple ול-Google.
  - **אירוח האתר**: האתר מתארח אצל ספק אירוח צד שלישי, שעשוי לעבד לוגים סטנדרטיים של שרת אינטרנט (כתובות IP, חותמות זמן בקשות, כתובות URL שנצפו) כחלק מאספקת תוכן. לוגים אלה נוצרים אוטומטית ומשמשים רק לתפעול תשתית ואבטחה.
- **הגבלת קצב API**: שרת ה-API שלנו מעבד זמנית כתובות IP בזיכרון לצורך הגבלת קצב ומניעת שימוש לרעה כדי להבטיח גישה הוגנת לכל המשתמשים. נתונים אלה אינם נשמרים באופן קבוע.
- **יצירת קשר דרך האתר**: באתר מופיעה כתובת דוא"ל ליצירת קשר עבור משוב או שאלות. אם תשלח לנו דוא"ל, נקבל את כתובת הדוא"ל ואת תוכן ההודעה מרצונך. אנו משתמשים בכך רק כדי להשיב ומוחקים לאחר סיום הטיפול (בדרך כלל תוך 30 יום).

## 2. כיצד אנו משתמשים במידע

כל מידע מוגבל (למשל הודעות דוא"ל וולונטריות) משמש אך ורק למתן תמיכה. אין שימוש בנתונים אישיים לשיווק, פרסום או פרופיילינג. תכונות עתידיות כמו הערות מסונכרנות לענן ישמשו בלעדית לאפשר שמירה ושליפה של האנוטציות האישיות שלך על כתבי הקודש.

## 3. שיתוף וגילוי מידע

איננו משתפים, מוכרים או חושפים מידע משתמשים משום שאיננו אוספים נתונים אישיים באופן אוטומטי. כפרויקט קוד פתוח ב-GitHub[](https://github.com/jhonnyisaacc/davar), כל תרומה או issue שתשלח כפופים לנהלי הפרטיות של GitHub.

אם יתווספו תכונות ענן, הערות עשויות להיות מעובדות בידי ספקי שירות (למשל אחסון ענן כמו AWS או Google Cloud) תחת הסכמי עיבוד נתונים מחמירים, המבטיחים פעולה לפי הוראותינו בלבד, הגנה מקבילה וללא שימוש נוסף.

נכון לעכשיו אין העברה בינלאומית של נתונים. עבור תכונות ענן עתידיות, כל העברה תתבצע עם אמצעי הגנה נאותים לפי Ley 25.326.

## 4. אחסון נתונים ואבטחה

- **נתונים מקומיים** (העדפות, והערות מקומיות עתידיות) נשארים במכשיר שלך.
- כל אחסון ענן עתידי ישתמש בהצפנה בסטנדרט תעשייתי (בתעבורה דרך HTTPS ובמנוחה לפי הצורך) ובאמצעי אבטחה מתאימים.
- כיום איננו מפעילים שרתים המאחסנים נתוני משתמשים אישיים.

## 5. פרטיות ילדים

האפליקציה והאתר אינם מיועדים לילדים מתחת לגיל 13. איננו אוספים ביודעין נתונים מילדים. אם נלמד על איסוף כזה, נמחק אותו מיד.

## 6. הזכויות שלך

לפי Ley 25.326 וחוקים דומים, יש לך זכות לעיין, לתקן, לעדכן או למחוק כל מידע אישי שאנו מחזיקים (אף שכיום איננו מחזיקים כזה). לגבי דוא"ל וולונטרי או הערות עתידיות:

- פנה אלינו כדי לממש זכויות (למשל מחיקת הערות מסונכרנות).
- נשיב בתוך 10 ימים (או כפי שנדרש בדין).
- אין עמלות לבקשות זכויות אלא אם הבקשות מופרזות.

## 7. שינויים במדיניות פרטיות זו

אנו עשויים לעדכן מדיניות זו כדי לשקף תכונות חדשות (למשל הערות פסוקים עם סנכרון ענן אופציונלי), דרישות חוקיות או שיפורים. נפרסם את הגרסה המעודכנת ב-https://davar.bible/privacy עם תאריך כניסה לתוקף חדש. לגבי שינויים מהותיים הכוללים איסוף נתונים חדש, נודיע לך בתוך האפליקציה (למשל חלון קופץ או הודעה בהגדרות) ונקבל הסכמה כנדרש בדין לפני הפעלת התכונה.

המשך שימוש לאחר השינויים מהווה הסכמה למדיניות המעודכנת.

## 8. יצירת קשר

לשאלות לגבי מדיניות זו או פרטיות, צור קשר ב: hi@davar.bible

**הערת קוד פתוח**: Davar הוא פרויקט קוד פתוח. הקוד זמין ב-GitHub[](https://github.com/jhonnyisaacc/davar). אין בכך איסוף נתונים אישיים דרך המאגר.

מי ייתן ו-Davar יהיה כלי לקרב אותך לדברו של YHVH בצורתו הטהורה.
`;

const LEGAL_CONTENT: LegalContentByLocale = {
	en: {
		terms: EN_TERMS,
		privacy: EN_PRIVACY,
	},
	es: {
		terms: ES_TERMS,
		privacy: ES_PRIVACY,
	},
	he: {
		terms: HE_TERMS,
		privacy: HE_PRIVACY,
	},
};

export const getLegalContent = (
	kind: LegalKind,
	locale: keyof LegalContentByLocale = "en",
): string => LEGAL_CONTENT[locale]?.[kind] ?? LEGAL_CONTENT.en[kind];

const LAST_UPDATED_REGEX = /^\*\*Last Updated:\*\*\s*(.+)$/i;
const EFFECTIVE_DATE_REGEX = /^\*\*Effective Date:\*\*\s*(.+)$/i;
const HEADING_REGEX = /^#\s+/;

const extractLastUpdated = (markdown: string): string | null => {
	const match = markdown
		.split("\n")
		.map((line) => line.trim())
		.find((line) => LAST_UPDATED_REGEX.test(line));

	if (!match) return null;
	const result = LAST_UPDATED_REGEX.exec(match);
	return result?.[1]?.trim() ?? null;
};

const stripHeaderLines = (markdown: string): string => {
	const lines = markdown.split("\n");
	const filtered = lines.filter((line) => {
		const trimmed = line.trim();
		if (!trimmed) return true;
		if (HEADING_REGEX.test(trimmed)) return false;
		if (EFFECTIVE_DATE_REGEX.test(trimmed)) return false;
		if (LAST_UPDATED_REGEX.test(trimmed)) return false;
		return true;
	});
	return filtered.join("\n").trim();
};

export const getLegalDoc = (
	kind: LegalKind,
	locale: keyof LegalContentByLocale = "en",
): LegalDoc => {
	const markdown = getLegalContent(kind, locale);
	return {
		title: LEGAL_TITLES[locale]?.[kind] ?? LEGAL_TITLES.en[kind],
		lastUpdated: extractLastUpdated(markdown),
		body: stripHeaderLines(markdown),
	};
};

const legalContentApi = {
	getLegalContent,
	getLegalDoc,
};

export default legalContentApi;
