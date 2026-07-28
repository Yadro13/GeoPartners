export function oauthErrorMessage(code: string | null) {
  if (!code) return null;

  switch (code.toLowerCase()) {
    case "access_denied":
      return "Вхід через Google скасовано.";
    case "account_not_linked":
      return "Google-акаунт ще не підключено до цього облікового запису.";
    case "forbidden":
      return "Для цього облікового запису вхід через Google недоступний.";
    case "signup_disabled":
      return "Реєстрація через Google тимчасово недоступна.";
    default:
      return "Не вдалося завершити вхід через Google. Спробуйте ще раз.";
  }
}
