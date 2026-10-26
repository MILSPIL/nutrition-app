// Independent feature tests must not be covered by the weekly reminder.
// This does not change the application clock, welcome/release screen or data.
export async function dismissIndependentMeasurementReminder(context) {
  await context.addInitScript(() => {
    // The measurement reminder uses the browser's local date, not the diary's
    // Kyiv date. These differ for part of Monday on UTC CI runners.
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    localStorage.setItem('measurementReminderDismissed', day);
  });
}
