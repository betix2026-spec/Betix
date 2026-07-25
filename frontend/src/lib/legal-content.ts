import type { Locale } from "@/lib/i18n";

type LegalSection = {
    title: string;
    paragraphs: string[];
};

type LegalPage = {
    title: string;
    accent: string;
    updated: string;
    sections: LegalSection[];
};

const terms: Record<Locale, LegalPage> = {
    fr: {
        title: "Conditions d'Utilisation",
        accent: "d'Utilisation",
        updated: "Dernière mise à jour : 25 Juillet 2026",
        sections: [
            { title: "Acceptation", paragraphs: ["En accédant ou en utilisant BETIX, vous acceptez les présentes conditions. Si vous ne les acceptez pas, veuillez ne pas utiliser le service."] },
            { title: "Description du Service", paragraphs: ["BETIX est un outil d'assistance et d'analyse algorithmique destiné à l'analyse d'événements sportifs.", "BETIX n'est pas un bookmaker, ne prend aucun pari et ne garantit aucun gain financier. Les paris sportifs comportent des risques."] },
            { title: "Compte Utilisateur", paragraphs: ["Certaines fonctionnalités nécessitent un compte. Vous êtes responsable de la confidentialité de vos identifiants. Le service est réservé aux personnes majeures."] },
            { title: "Abonnements, essais et résiliation", paragraphs: ["Les abonnements sont gérés via Stripe. Vous pouvez résilier à tout moment depuis votre dashboard.", "Pendant un essai, l'accès premium prend fin immédiatement. Après paiement mensuel, vous gardez l'accès jusqu'à la fin de la période déjà payée.", "Pour un abonnement annuel, BETIX peut rembourser les mois non utilisés. L'estimation est calculée avec le prix mensuel en vigueur multiplié par les mois utilisés, puis vérifiée par le support."] },
            { title: "Limitation de Responsabilité", paragraphs: ["BETIX et ses créateurs ne peuvent pas être tenus responsables des pertes directes ou indirectes liées à l'utilisation des analyses fournies."] },
            { title: "Propriété Intellectuelle", paragraphs: ["Les contenus, algorithmes, marques et éléments visuels de BETIX restent la propriété de BETIX. Toute reproduction non autorisée est interdite."] },
            { title: "Contact", paragraphs: ["Pour toute question, contactez-nous via le support de la plateforme."] },
        ],
    },
    en: {
        title: "Terms of Use",
        accent: "of Use",
        updated: "Last updated: July 25, 2026",
        sections: [
            { title: "Acceptance", paragraphs: ["By accessing or using BETIX, you agree to these terms. If you do not agree, please do not use the service."] },
            { title: "Service Description", paragraphs: ["BETIX is an algorithmic sports-analysis assistant designed to help users review sporting events.", "BETIX is not a bookmaker, does not accept bets, and does not guarantee financial returns. Sports betting carries risk."] },
            { title: "User Account", paragraphs: ["Some features require an account. You are responsible for protecting your login credentials. The service is for adults only."] },
            { title: "Subscriptions, Trials, and Cancellation", paragraphs: ["Subscriptions are managed through Stripe. You can cancel at any time from your dashboard.", "During a trial, premium access ends immediately. After a monthly payment, you keep access until the end of the paid period.", "For annual subscriptions, BETIX may refund unused months. The estimate uses the current monthly price multiplied by months used and is then reviewed by support."] },
            { title: "Limitation of Liability", paragraphs: ["BETIX and its creators are not liable for direct or indirect losses arising from use of the analysis provided."] },
            { title: "Intellectual Property", paragraphs: ["BETIX content, algorithms, trademarks, and visual elements remain the property of BETIX. Unauthorized reproduction is prohibited."] },
            { title: "Contact", paragraphs: ["For questions, contact us through platform support."] },
        ],
    },
    es: {
        title: "Condiciones de Uso",
        accent: "de Uso",
        updated: "Última actualización: 25 de julio de 2026",
        sections: [
            { title: "Aceptación", paragraphs: ["Al acceder o utilizar BETIX, aceptas estas condiciones. Si no las aceptas, no utilices el servicio."] },
            { title: "Descripción del Servicio", paragraphs: ["BETIX es una herramienta de análisis deportivo algorítmico para revisar eventos deportivos.", "BETIX no es una casa de apuestas, no acepta apuestas y no garantiza ganancias. Las apuestas deportivas conllevan riesgos."] },
            { title: "Cuenta de Usuario", paragraphs: ["Algunas funciones requieren una cuenta. Eres responsable de proteger tus credenciales. El servicio es solo para adultos."] },
            { title: "Suscripciones, pruebas y cancelación", paragraphs: ["Las suscripciones se gestionan mediante Stripe. Puedes cancelar en cualquier momento desde tu panel.", "Durante una prueba, el acceso premium termina inmediatamente. Tras un pago mensual, conservas el acceso hasta el final del periodo pagado.", "En suscripciones anuales, BETIX puede reembolsar meses no utilizados. La estimación usa el precio mensual vigente multiplicado por los meses usados y luego la revisa soporte."] },
            { title: "Limitación de Responsabilidad", paragraphs: ["BETIX y sus creadores no son responsables de pérdidas directas o indirectas derivadas del uso de los análisis."] },
            { title: "Propiedad Intelectual", paragraphs: ["Los contenidos, algoritmos, marcas y elementos visuales de BETIX son propiedad de BETIX. Se prohíbe la reproducción no autorizada."] },
            { title: "Contacto", paragraphs: ["Para cualquier pregunta, contacta con soporte desde la plataforma."] },
        ],
    },
    de: {
        title: "Nutzungsbedingungen",
        accent: "bedingungen",
        updated: "Zuletzt aktualisiert: 25. Juli 2026",
        sections: [
            { title: "Akzeptanz", paragraphs: ["Durch Zugriff auf oder Nutzung von BETIX akzeptierst du diese Bedingungen. Wenn du nicht zustimmst, nutze den Dienst bitte nicht."] },
            { title: "Beschreibung des Dienstes", paragraphs: ["BETIX ist ein algorithmisches Sportanalyse-Tool zur Bewertung sportlicher Ereignisse.", "BETIX ist kein Buchmacher, nimmt keine Wetten an und garantiert keine finanziellen Gewinne. Sportwetten sind riskant."] },
            { title: "Benutzerkonto", paragraphs: ["Einige Funktionen erfordern ein Konto. Du bist für den Schutz deiner Zugangsdaten verantwortlich. Der Dienst richtet sich nur an Erwachsene."] },
            { title: "Abos, Testphasen und Kündigung", paragraphs: ["Abos werden über Stripe verwaltet. Du kannst jederzeit im Dashboard kündigen.", "Während einer Testphase endet der Premium-Zugang sofort. Nach einer Monatszahlung bleibt der Zugriff bis zum Ende des bezahlten Zeitraums bestehen.", "Bei Jahresabos kann BETIX ungenutzte Monate erstatten. Die Schätzung nutzt den aktuellen Monatspreis multipliziert mit genutzten Monaten und wird vom Support geprüft."] },
            { title: "Haftungsbeschränkung", paragraphs: ["BETIX und seine Ersteller haften nicht für direkte oder indirekte Verluste aus der Nutzung der bereitgestellten Analysen."] },
            { title: "Geistiges Eigentum", paragraphs: ["Inhalte, Algorithmen, Marken und visuelle Elemente von BETIX bleiben Eigentum von BETIX. Unbefugte Vervielfältigung ist untersagt."] },
            { title: "Kontakt", paragraphs: ["Bei Fragen kontaktiere uns über den Support der Plattform."] },
        ],
    },
};

const privacy: Record<Locale, LegalPage> = {
    fr: {
        title: "Politique de Confidentialité",
        accent: "Confidentialité",
        updated: "Dernière mise à jour : 25 Juillet 2026",
        sections: [
            { title: "Collecte des données", paragraphs: ["Nous collectons les informations nécessaires au compte, à la sécurité, aux préférences, aux abonnements, à la résiliation et au support."] },
            { title: "Utilisation des informations", paragraphs: ["Vos données servent à fournir le service, sécuriser votre compte, prévenir la fraude, gérer les abonnements et répondre au support."] },
            { title: "Partage des données", paragraphs: ["Nous ne vendons pas vos données. Des informations limitées peuvent être partagées avec Stripe pour la facturation, les résiliations, remboursements et factures."] },
            { title: "Sécurité des données", paragraphs: ["Les données sont stockées chez nos fournisseurs d'infrastructure et transmises via HTTPS/TLS."] },
            { title: "Conservation", paragraphs: ["Les données de compte sont conservées tant que le compte est actif. Les données de facturation peuvent être conservées selon les obligations légales, comptables ou de litige."] },
            { title: "Vos droits", paragraphs: ["Vous pouvez demander l'accès, la rectification, l'effacement, la limitation ou la portabilité de vos données via le support."] },
        ],
    },
    en: {
        title: "Privacy Policy",
        accent: "Privacy",
        updated: "Last updated: July 25, 2026",
        sections: [
            { title: "Data We Collect", paragraphs: ["We collect information needed for accounts, security, preferences, subscriptions, cancellation, refunds, and support."] },
            { title: "How We Use Information", paragraphs: ["Your data is used to provide the service, secure accounts, prevent fraud, manage subscriptions, and answer support requests."] },
            { title: "Data Sharing", paragraphs: ["We do not sell your data. Limited billing information may be shared with Stripe for subscriptions, cancellations, refunds, and invoices."] },
            { title: "Data Security", paragraphs: ["Data is stored with our infrastructure providers and transmitted over HTTPS/TLS."] },
            { title: "Retention", paragraphs: ["Account data is kept while the account is active. Billing data may be retained where required for legal, accounting, fraud-prevention, or dispute reasons."] },
            { title: "Your Rights", paragraphs: ["You may request access, correction, deletion, restriction, or portability of your data through support."] },
        ],
    },
    es: {
        title: "Política de Privacidad",
        accent: "Privacidad",
        updated: "Última actualización: 25 de julio de 2026",
        sections: [
            { title: "Datos que recopilamos", paragraphs: ["Recopilamos información necesaria para cuentas, seguridad, preferencias, suscripciones, cancelaciones, reembolsos y soporte."] },
            { title: "Uso de la información", paragraphs: ["Usamos tus datos para prestar el servicio, proteger cuentas, prevenir fraude, gestionar suscripciones y responder al soporte."] },
            { title: "Compartición de datos", paragraphs: ["No vendemos tus datos. Podemos compartir información de facturación limitada con Stripe para suscripciones, cancelaciones, reembolsos y facturas."] },
            { title: "Seguridad", paragraphs: ["Los datos se almacenan con nuestros proveedores de infraestructura y se transmiten mediante HTTPS/TLS."] },
            { title: "Conservación", paragraphs: ["Los datos de cuenta se conservan mientras la cuenta esté activa. Los datos de facturación pueden conservarse por motivos legales, contables, antifraude o de disputas."] },
            { title: "Tus derechos", paragraphs: ["Puedes solicitar acceso, corrección, eliminación, limitación o portabilidad de tus datos a través del soporte."] },
        ],
    },
    de: {
        title: "Datenschutzerklärung",
        accent: "Datenschutz",
        updated: "Zuletzt aktualisiert: 25. Juli 2026",
        sections: [
            { title: "Erhobene Daten", paragraphs: ["Wir erfassen Informationen, die für Konten, Sicherheit, Präferenzen, Abos, Kündigungen, Erstattungen und Support nötig sind."] },
            { title: "Nutzung der Informationen", paragraphs: ["Wir nutzen Daten zur Bereitstellung des Dienstes, Kontosicherheit, Betrugsprävention, Abo-Verwaltung und Bearbeitung von Supportanfragen."] },
            { title: "Weitergabe von Daten", paragraphs: ["Wir verkaufen keine Daten. Begrenzte Rechnungsdaten können mit Stripe für Abos, Kündigungen, Erstattungen und Rechnungen geteilt werden."] },
            { title: "Datensicherheit", paragraphs: ["Daten werden bei unseren Infrastruktur-Anbietern gespeichert und über HTTPS/TLS übertragen."] },
            { title: "Aufbewahrung", paragraphs: ["Kontodaten bleiben gespeichert, solange das Konto aktiv ist. Rechnungsdaten können aus rechtlichen, buchhalterischen, Betrugspräventions- oder Streitfallgründen länger gespeichert werden."] },
            { title: "Deine Rechte", paragraphs: ["Du kannst über den Support Zugriff, Berichtigung, Löschung, Einschränkung oder Übertragbarkeit deiner Daten verlangen."] },
        ],
    },
};

export function getTermsContent(locale: Locale) {
    return terms[locale] || terms.fr;
}

export function getPrivacyContent(locale: Locale) {
    return privacy[locale] || privacy.fr;
}
