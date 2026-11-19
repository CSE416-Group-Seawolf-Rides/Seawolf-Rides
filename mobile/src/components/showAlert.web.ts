// Browser version of showAlert. window.alert is a stopgap so errors are never silent on the
// web; the planned styled ConfirmDialog replaces it (docs/web-app-plan.md, section 4.1).
export function showAlert(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}
