import type { AppLocale } from "./config";

type RegistrationInput = { name: string; email: string; method: "password" | "google" };

export function emailMessages(locale: AppLocale) {
  const labels = messages[locale];
  return {
    passwordReset(url: string) {
      return { subject: labels.resetSubject, text: `${labels.resetText}: ${url}`, html: `<p>${labels.resetHtml}</p><p><a href="${url}">${labels.resetLink}</a></p>` };
    },
    verification(url: string) {
      return { subject: labels.verifySubject, text: `${labels.verifyText}: ${url}`, html: `<p>${labels.verifyHtml}</p><p><a href="${url}">${labels.verifyLink}</a></p><p>${labels.oneHour}</p>` };
    },
    newRegistration(input: RegistrationInput, reviewUrl: string) {
      const method = input.method === "google" ? "Google" : labels.emailPassword;
      const text = `${labels.newRegistration}\n${labels.name}: ${input.name}\nEmail: ${input.email}\n${labels.method}: ${method}\n${labels.review}: ${reviewUrl}`;
      return { subject: labels.newSubject, text, html: `<p>${labels.newRegistration}.</p><p><strong>${escapeHtml(input.name)}</strong><br>${escapeHtml(input.email)}<br>${labels.method}: ${method}</p><p><a href="${reviewUrl}">${labels.review}</a></p>`, button: labels.review };
    },
    decision(approved: boolean, comment: string | undefined, appUrl: string) {
      const commentText = comment ? `\n\n${labels.adminComment}: ${comment}` : "";
      return { subject: approved ? labels.approvedSubject : labels.decisionSubject, text: `${approved ? `${labels.approvedText}: ${appUrl}/sign-in` : labels.rejectedText}${commentText}` };
    },
  };
}

const messages = {
  uk: { resetSubject: "Відновлення пароля GeoPartners", resetText: "Щоб встановити новий пароль, відкрийте посилання", resetHtml: "Щоб встановити новий пароль GeoPartners, відкрийте посилання:", resetLink: "Встановити новий пароль", verifySubject: "Підтвердження email у GeoPartners", verifyText: "Підтвердіть адресу email за посиланням", verifyHtml: "Підтвердіть адресу email для реєстрації у GeoPartners.", verifyLink: "Підтвердити email", oneHour: "Посилання дійсне протягом однієї години.", newRegistration: "Нова заявка на доступ до GeoPartners", newSubject: "Нова заявка на доступ до GeoPartners", name: "Ім’я", method: "Спосіб", emailPassword: "email і пароль", review: "Переглянути заявку", adminComment: "Коментар адміністратора", approvedSubject: "Доступ до GeoPartners підтверджено", decisionSubject: "Результат реєстрації у GeoPartners", approvedText: "Вашу реєстрацію підтверджено. Увійти", rejectedText: "Вашу заявку на доступ відхилено." },
  de: { resetSubject: "GeoPartners-Passwort zurücksetzen", resetText: "Öffnen Sie den Link, um ein neues Passwort festzulegen", resetHtml: "Öffnen Sie den Link, um ein neues GeoPartners-Passwort festzulegen:", resetLink: "Neues Passwort festlegen", verifySubject: "E-Mail-Adresse bei GeoPartners bestätigen", verifyText: "Bestätigen Sie Ihre E-Mail-Adresse über diesen Link", verifyHtml: "Bestätigen Sie Ihre E-Mail-Adresse für die Registrierung bei GeoPartners.", verifyLink: "E-Mail bestätigen", oneHour: "Der Link ist eine Stunde lang gültig.", newRegistration: "Neuer Zugangsantrag für GeoPartners", newSubject: "Neuer Zugangsantrag für GeoPartners", name: "Name", method: "Methode", emailPassword: "E-Mail und Passwort", review: "Antrag prüfen", adminComment: "Kommentar des Administrators", approvedSubject: "Zugang zu GeoPartners genehmigt", decisionSubject: "Ergebnis Ihrer GeoPartners-Registrierung", approvedText: "Ihre Registrierung wurde genehmigt. Anmelden", rejectedText: "Ihr Zugangsantrag wurde abgelehnt." },
  en: { resetSubject: "Reset your GeoPartners password", resetText: "Open the link to set a new password", resetHtml: "Open the link to set a new GeoPartners password:", resetLink: "Set new password", verifySubject: "Verify your email for GeoPartners", verifyText: "Verify your email address using this link", verifyHtml: "Verify your email address to register with GeoPartners.", verifyLink: "Verify email", oneHour: "The link is valid for one hour.", newRegistration: "New GeoPartners access request", newSubject: "New GeoPartners access request", name: "Name", method: "Method", emailPassword: "email and password", review: "Review request", adminComment: "Administrator comment", approvedSubject: "GeoPartners access approved", decisionSubject: "GeoPartners registration result", approvedText: "Your registration has been approved. Sign in", rejectedText: "Your access request was rejected." },
} satisfies Record<AppLocale, Record<string, string>>;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
